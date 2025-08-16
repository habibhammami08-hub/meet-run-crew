import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";

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

  // Fonction pour récupérer le statut d'abonnement avec validation complète
  const fetchSubscriptionStatus = useCallback(async (userId: string, retryCount = 0) => {
    const maxRetries = 3;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('sub_status, sub_current_period_end')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        if (retryCount < maxRetries) {
          logger.warn(`Subscription fetch retry ${retryCount + 1}/${maxRetries}:`, error);
          setTimeout(() => fetchSubscriptionStatus(userId, retryCount + 1), 1000 * (retryCount + 1));
          return;
        }
        throw error;
      }

      if (!data) {
        logger.warn('No profile found for user:', userId);
        setHasActiveSubscription(false);
        setSubscriptionStatus(null);
        setSubscriptionEnd(null);
        return;
      }

      // Validation stricte du statut d'abonnement
      const validStatuses = ['active', 'trialing', 'canceled', 'past_due', 'incomplete'];
      const status = validStatuses.includes(data.sub_status) ? data.sub_status : 'inactive';
      
      // Calculer hasActiveSubscription selon les critères stricts
      const isActiveStatus = ['active', 'trialing'].includes(status);
      const isNotExpired = !data.sub_current_period_end || new Date(data.sub_current_period_end) > new Date();
      const computedActiveSubscription = isActiveStatus && isNotExpired;
      
      setHasActiveSubscription(computedActiveSubscription);
      setSubscriptionStatus(status);
      setSubscriptionEnd(data.sub_current_period_end);
      
      logger.debug('Subscription status updated:', { 
        status, 
        isActiveStatus, 
        isNotExpired, 
        hasActiveSubscription: computedActiveSubscription 
      });
    } catch (error) {
      logger.error('Error in fetchSubscriptionStatus:', error);
      setHasActiveSubscription(false);
      setSubscriptionStatus(null);
      setSubscriptionEnd(null);
    }
  }, []);

  // CORRECTION: Fonction pour s'assurer qu'un profil existe avec gestion d'erreur améliorée
  const ensureProfile = useCallback(async (user: User) => {
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
        // CORRECTION: Création de profil avec données validées
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
  }, []);

  // Fonction pour rafraîchir l'abonnement
  const refreshSubscription = useCallback(async () => {
    if (user) {
      await fetchSubscriptionStatus(user.id);
    }
  }, [user, fetchSubscriptionStatus]);

  // CORRECTION: Fonction de déconnexion forcée et immédiate
  const signOut = async () => {
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

    // CORRECTION: Fonction pour gérer les changements d'état d'auth de manière sécurisée
    const handleAuthStateChange = async (event: string, session: Session | null) => {
      if (!mounted) return;

      logger.debug("Auth state changed:", event, session?.user?.id);
      
      try {
        // CORRECTION: Vérification stricte - seulement traiter les sessions valides avec un utilisateur
        if (session && session.user) {
          // Utilisateur connecté avec session valide
          setSession(session);
          setUser(session.user);
          
          // Ne pas recréer le profil si suppression ou déconnexion en cours
          if (!localStorage.getItem('deletion_in_progress') && 
              !localStorage.getItem('logout_in_progress') &&
              mounted) {
            
            // CORRECTION: Opérations asynchrones avec timeout de sécurité
            const timeoutId = setTimeout(() => {
              if (mounted) {
                logger.warn("Auth operations timeout, proceeding without profile/subscription");
                setLoading(false);
              }
            }, 10000); // 10 secondes max

            try {
              await ensureProfile(session.user);
              if (mounted) {
                await fetchSubscriptionStatus(session.user.id);
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
          // Aucune session ou session invalide - utilisateur non connecté
          setSession(null);
          setUser(null);
          setHasActiveSubscription(false);
          setSubscriptionStatus(null);
          setSubscriptionEnd(null);
          setLoading(false);
        }
      } catch (error) {
        logger.error("Error in auth state change handler:", error);
        // En cas d'erreur, s'assurer que l'utilisateur n'est pas connecté par défaut
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
      const { data } = supabase.auth.onAuthStateChange(handleAuthStateChange);
      authSubscription = data.subscription;
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
  }, [ensureProfile, fetchSubscriptionStatus]);

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