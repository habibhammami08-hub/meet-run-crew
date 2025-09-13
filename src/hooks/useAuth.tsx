import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { getSupabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";

const supabase = getSupabase();

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  hasActiveSubscription: boolean;
  subscriptionStatus: string | null;
  subscriptionEnd: string | null;
  refreshSubscription: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  hasActiveSubscription: false,
  subscriptionStatus: null,
  subscriptionEnd: null,
  refreshSubscription: async () => {},
  signOut: async () => {},
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [subscriptionEnd, setSubscriptionEnd] = useState<string | null>(null);

  // CORRECTION: Fonction simplifiée pour récupérer l'abonnement
  const fetchSubscriptionStatus = useRef<(userId: string) => Promise<void>>();
  
  fetchSubscriptionStatus.current = async (userId: string) => {
    if (!supabase) {
      logger.warn("[auth] Client Supabase indisponible");
      return;
    }
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('sub_status, sub_current_period_end')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        logger.warn('No profile found for user:', userId);
        setHasActiveSubscription(false);
        setSubscriptionStatus(null);
        setSubscriptionEnd(null);
        return;
      }

      const validStatuses = ['active', 'trialing', 'canceled', 'past_due', 'incomplete'];
      const status = validStatuses.includes(data.sub_status) ? data.sub_status : 'inactive';
      
      const isActiveStatus = ['active', 'trialing'].includes(status);
      const isNotExpired = !data.sub_current_period_end || new Date(data.sub_current_period_end) > new Date();
      const computedActiveSubscription = isActiveStatus && isNotExpired;
      
      setHasActiveSubscription(computedActiveSubscription);
      setSubscriptionStatus(status);
      setSubscriptionEnd(data.sub_current_period_end);
      
      logger.debug('Subscription status updated:', { 
        status, 
        computedActiveSubscription 
      });
    } catch (error) {
      logger.error('Error in fetchSubscriptionStatus:', error);
      setHasActiveSubscription(false);
      setSubscriptionStatus(null);
      setSubscriptionEnd(null);
    }
  };

  // CORRECTION: Fonction simplifiée pour créer/vérifier le profil
  const ensureProfile = useRef<(user: User) => Promise<any>>();
  
  ensureProfile.current = async (user: User) => {
    if (!supabase) {
      logger.warn("[auth] Client Supabase indisponible");
      return;
    }
    
    try {
      const { data: existingProfile, error: selectError } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();

      if (selectError && selectError.code !== 'PGRST116') {
        throw selectError;
      }

      if (!existingProfile) {
        const profileData = {
          id: user.id,
          email: user.email || '',
          full_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
          .from('profiles')
          .upsert(profileData, { 
            onConflict: 'id',
            ignoreDuplicates: false 
          })
          .select()
          .single();

        if (error) {
          logger.error("[profile] Creation error:", error);
          throw error;
        }

        logger.debug("[profile] Profile created successfully:", data);
        return data;
      }

      return existingProfile;
    } catch (error) {
      logger.error("[profile] ensureProfile error:", error);
      throw error;
    }
  };

  // CORRECTION: Fonction refresh simplifiée
  const refreshSubscription = useCallback(async () => {
    if (user) {
      await fetchSubscriptionStatus.current?.(user.id);
      window.dispatchEvent(new CustomEvent('profileRefresh', { detail: { userId: user.id } }));
    }
  }, [user]);

  // CORRECTION: Fonction de déconnexion forcée et immédiate
  const signOut = async () => {
    if (!supabase) {
      logger.warn("[auth] Client Supabase indisponible pour la déconnexion");
      // Nettoyage local quand même
      setUser(null);
      setSession(null);
      setHasActiveSubscription(false);
      setSubscriptionStatus(null);
      setSubscriptionEnd(null);
      setLoading(false);
      window.location.replace("/");
      return;
    }
    
    try {
      logger.debug("Starting logout process...");

      // IMMÉDIATEMENT nettoyer le state local pour éviter tout délai
      setUser(null);
      setSession(null);
      setHasActiveSubscription(false);
      setSubscriptionStatus(null);
      setSubscriptionEnd(null);
      setLoading(false);

      // Nettoyer le localStorage immédiatement
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (e) {
        logger.warn("Storage clear error:", e);
      }

      // Nettoyer les channels realtime
      try {
        const channels = supabase.getChannels();
        for (const channel of channels) {
          await supabase.removeChannel(channel);
        }
      } catch (e) {
        logger.warn("Error removing channels:", e);
      }

      // Déconnexion Supabase (en arrière-plan, ne pas attendre)
      setTimeout(async () => {
        try {
          await supabase.auth.signOut({ scope: "global" });
        } catch (e) {
          logger.warn("SignOut error:", e);
        }
      }, 0);

      // Redirection immédiate sans attendre
      window.location.replace("/");
    } catch (error) {
      logger.error("Critical logout error:", error);
      // Force logout même en cas d'erreur critique
      setUser(null);
      setSession(null);
      setHasActiveSubscription(false);
      setSubscriptionStatus(null);
      setSubscriptionEnd(null);
      setLoading(false);
      
      // Nettoyer le stockage et rediriger quoi qu'il arrive
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (e) {}
      
      window.location.replace("/");
    }
  };

  useEffect(() => {
    let mounted = true;
    let authSubscription: any = null;

    // CORRECTION: Nettoyer l'URL des fragments OAuth AVANT d'écouter les auth events
    if (window.location.search.includes('access_token') || window.location.hash.includes('access_token')) {
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);
      logger.debug("OAuth URL cleaned");
    }

    // CORRECTION: Fonction simplifiée pour gérer les changements d'état d'auth
    const handleAuthStateChange = async (event: string, session: Session | null) => {
      if (!mounted) return;

      logger.debug("Auth state changed:", event, session?.user?.id);
      
      try {
        if (session && session.user) {
          // Utilisateur connecté
          setSession(session);
          setUser(session.user);
          
          // Opérations async simples avec timeout
          if (!localStorage.getItem('deletion_in_progress') && 
              !localStorage.getItem('logout_in_progress') &&
              mounted) {
            
            const timeoutId = setTimeout(() => {
              if (mounted) {
                logger.warn("Auth operations timeout");
                setLoading(false);
              }
            }, 8000); // 8 secondes max

            try {
              await ensureProfile.current?.(session.user);
              if (mounted) {
                await fetchSubscriptionStatus.current?.(session.user.id);
              }
            } catch (error) {
              logger.error("Auth async operations error:", error);
            } finally {
              clearTimeout(timeoutId);
              if (mounted) {
                setLoading(false);
              }
            }
          } else {
            setLoading(false);
          }
        } else {
          // Pas de session
          setSession(null);
          setUser(null);
          setHasActiveSubscription(false);
          setSubscriptionStatus(null);
          setSubscriptionEnd(null);
          setLoading(false);
        }
      } catch (error) {
        logger.error("Error in auth state change handler:", error);
        setSession(null);
        setUser(null);
        setHasActiveSubscription(false);
        setSubscriptionStatus(null);
        setSubscriptionEnd(null);
        if (mounted) {
          setLoading(false);
        }
      }
    };

    // CORRECTION: Initialisation avec gestion d'erreur améliorée
    const initAuth = async () => {
      if (!supabase) {
        logger.warn("[auth] Client Supabase indisponible - authentification désactivée");
        setLoading(false);
        return;
      }
      
      try {
        // Nettoyer l'URL avant d'initialiser l'auth
        if (window.location.hash && 
            !window.location.pathname.includes('/auth') && 
            window.location.pathname !== '/goodbye') {
          window.history.replaceState(null, '', window.location.pathname);
        }
        
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          logger.error("Error getting initial session:", error);
        }
        
        await handleAuthStateChange('INITIAL_SESSION', session);
      } catch (error) {
        logger.error("Auth initialization error:", error);
        if (mounted) {
          setLoading(false);
        }
      }
    };

    // CORRECTION: Écouter les changements d'état d'authentification avec gestion d'erreur
    try {
      if (supabase) {
        const { data } = supabase.auth.onAuthStateChange(handleAuthStateChange);
        authSubscription = data.subscription;
      }
    } catch (error) {
      logger.error("Error setting up auth state listener:", error);
    }

    initAuth();

    return () => {
      mounted = false;
      if (authSubscription) {
        try {
          authSubscription.unsubscribe();
        } catch (error) {
          logger.error("Error unsubscribing from auth:", error);
        }
      }
    };
  }, []); // CORRECTION: Pas de dépendances pour éviter les re-renders !

  const value = {
    user,
    session,
    loading,
    hasActiveSubscription,
    subscriptionStatus,
    subscriptionEnd,
    refreshSubscription,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};