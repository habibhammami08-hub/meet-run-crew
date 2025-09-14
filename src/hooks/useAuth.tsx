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

  // CORRECTION: Utiliser des refs pour éviter les re-créations de fonctions
  const mountedRef = useRef(true);
  const sessionCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const authSubscriptionRef = useRef<any>(null);

  // CORRECTION: Fonction stable avec useCallback et dépendances fixes
  const fetchSubscriptionStatus = useCallback(async (userId: string, retryCount = 0) => {
    const maxRetries = 3;
    
    if (!supabase || !mountedRef.current) {
      logger.warn("[auth] Client Supabase indisponible ou composant démonté");
      return;
    }
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('sub_status, sub_current_period_end')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        if (retryCount < maxRetries) {
          logger.warn(`Subscription fetch retry ${retryCount + 1}/${maxRetries}:`, error);
          setTimeout(() => {
            if (mountedRef.current) {
              fetchSubscriptionStatus(userId, retryCount + 1);
            }
          }, 1000 * (retryCount + 1));
          return;
        }
        throw error;
      }

      if (!mountedRef.current) return;

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
      if (mountedRef.current) {
        logger.error('Error in fetchSubscriptionStatus:', error);
        setHasActiveSubscription(false);
        setSubscriptionStatus(null);
        setSubscriptionEnd(null);
      }
    }
  }, []); // CORRECTION: Pas de dépendances pour éviter les re-créations

  // CORRECTION: Fonction stable pour créer le profil
  const ensureProfile = useCallback(async (user: User) => {
    if (!supabase || !mountedRef.current) {
      logger.warn("[auth] Client Supabase indisponible ou composant démonté");
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

      if (!existingProfile && mountedRef.current) {
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
      if (mountedRef.current) {
        logger.error("[profile] ensureProfile error:", error);
        throw error;
      }
    }
  }, []); // CORRECTION: Pas de dépendances pour éviter les re-créations

  // CORRECTION: Fonction de refresh stable
  const refreshSubscription = useCallback(async () => {
    if (user && mountedRef.current) {
      await fetchSubscriptionStatus(user.id);
      window.dispatchEvent(new CustomEvent('profileRefresh', { detail: { userId: user.id } }));
    }
  }, [user?.id, fetchSubscriptionStatus]); // CORRECTION: Seulement user.id comme dépendance

  // CORRECTION: Fonction de déconnexion stable
  const signOut = useCallback(async () => {
    if (!supabase) {
      logger.warn("[auth] Client Supabase indisponible pour la déconnexion");
      // Nettoyage local
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

      // Nettoyage immédiat du state
      setUser(null);
      setSession(null);
      setHasActiveSubscription(false);
      setSubscriptionStatus(null);
      setSubscriptionEnd(null);
      setLoading(false);

      // Nettoyer le stockage
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

      // Déconnexion Supabase en arrière-plan
      setTimeout(async () => {
        try {
          await supabase.auth.signOut({ scope: "global" });
        } catch (e) {
          logger.warn("SignOut error:", e);
        }
      }, 0);

      // Redirection immédiate
      window.location.replace("/");
    } catch (error) {
      logger.error("Critical logout error:", error);
      // Force cleanup et redirection
      setUser(null);
      setSession(null);
      setHasActiveSubscription(false);
      setSubscriptionStatus(null);
      setSubscriptionEnd(null);
      setLoading(false);
      
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (e) {}
      
      window.location.replace("/");
    }
  }, []); // CORRECTION: Pas de dépendances pour éviter les re-créations

  // CORRECTION: Fonction de surveillance de session stable
  const startSessionMonitoring = useCallback(() => {
    if (sessionCheckIntervalRef.current) {
      clearInterval(sessionCheckIntervalRef.current);
    }
    
    sessionCheckIntervalRef.current = setInterval(async () => {
      if (!mountedRef.current || !supabase) return;
      
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          logger.warn("Session check error:", error);
          return;
        }
        
        // Vérifier expiration
        if (session?.expires_at) {
          const expiresAt = new Date(session.expires_at * 1000);
          const now = new Date();
          const tenMinutesFromNow = new Date(now.getTime() + 10 * 60 * 1000);
          
          if (expiresAt < tenMinutesFromNow) {
            logger.info("Session proche de l'expiration, renouvellement");
            try {
              await supabase.auth.refreshSession();
              logger.info("Session renouvelée avec succès");
            } catch (refreshError) {
              logger.error("Erreur lors du renouvellement:", refreshError);
            }
          }
        }
      } catch (error) {
        logger.error("Erreur vérification session:", error);
      }
    }, 5 * 60 * 1000);
  }, []); // CORRECTION: Pas de dépendances

  // CORRECTION: useEffect principal avec dépendances fixes
  useEffect(() => {
    mountedRef.current = true;
    
    // Nettoyer l'URL OAuth
    if (window.location.search.includes('access_token') || window.location.hash.includes('access_token')) {
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);
      logger.debug("OAuth URL cleaned");
    }

    // Handler pour les changements d'auth - CORRECTION: fonction stable
    const handleAuthStateChange = async (event: string, session: Session | null) => {
      if (!mountedRef.current) return;

      logger.debug("Auth state changed:", event, session?.user?.id);
      
      try {
        if (session && session.user) {
          // Utilisateur connecté
          setSession(session);
          setUser(session.user);
          startSessionMonitoring();
          
          // Opérations asynchrones avec timeout de sécurité
          if (!localStorage.getItem('deletion_in_progress') && 
              !localStorage.getItem('logout_in_progress') &&
              mountedRef.current) {
            
            const timeoutId = setTimeout(() => {
              if (mountedRef.current) {
                logger.warn("Auth operations timeout");
                setLoading(false);
              }
            }, 10000);

            try {
              await ensureProfile(session.user);
              if (mountedRef.current) {
                await fetchSubscriptionStatus(session.user.id);
              }
            } catch (error) {
              logger.error("Auth async operations error:", error);
            } finally {
              clearTimeout(timeoutId);
              if (mountedRef.current) {
                setLoading(false);
              }
            }
          } else {
            setLoading(false);
          }
        } else {
          // Utilisateur non connecté
          setSession(null);
          setUser(null);
          setHasActiveSubscription(false);
          setSubscriptionStatus(null);
          setSubscriptionEnd(null);
          setLoading(false);
          
          if (sessionCheckIntervalRef.current) {
            clearInterval(sessionCheckIntervalRef.current);
            sessionCheckIntervalRef.current = null;
          }
        }
      } catch (error) {
        logger.error("Error in auth state change handler:", error);
        if (mountedRef.current) {
          setSession(null);
          setUser(null);
          setHasActiveSubscription(false);
          setSubscriptionStatus(null);
          setSubscriptionEnd(null);
          setLoading(false);
        }
      }
    };

    // Initialisation
    const initAuth = async () => {
      if (!supabase) {
        logger.warn("[auth] Client Supabase indisponible");
        setLoading(false);
        return;
      }
      
      try {
        // Nettoyer l'URL avant initialisation
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
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    };

    // Écouter les changements d'auth
    try {
      if (supabase) {
        const { data } = supabase.auth.onAuthStateChange(handleAuthStateChange);
        authSubscriptionRef.current = data.subscription;
      }
    } catch (error) {
      logger.error("Error setting up auth listener:", error);
    }

    initAuth();

    // CORRECTION: Cleanup function améliorée
    return () => {
      mountedRef.current = false;
      
      if (sessionCheckIntervalRef.current) {
        clearInterval(sessionCheckIntervalRef.current);
        sessionCheckIntervalRef.current = null;
      }
      
      if (authSubscriptionRef.current) {
        try {
          authSubscriptionRef.current.unsubscribe();
          authSubscriptionRef.current = null;
        } catch (error) {
          logger.error("Error unsubscribing from auth:", error);
        }
      }
    };
  }, []); // CORRECTION: Array vide - pas de dépendances pour éviter les re-exécutions

  // CORRECTION: Mémoiser la valeur du contexte pour éviter les re-renders
  const contextValue = useRef<AuthContextType>({
    user: null,
    session: null,
    loading: true,
    hasActiveSubscription: false,
    subscriptionStatus: null,
    subscriptionEnd: null,
    refreshSubscription,
    signOut,
  });

  // CORRECTION: Mettre à jour la référence seulement quand nécessaire
  contextValue.current = {
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
    <AuthContext.Provider value={contextValue.current}>
      {children}
    </AuthContext.Provider>
  );
};