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
  // Nouvelle méthode pour vérifier et rafraîchir la session
  validateSession: () => Promise<boolean>;
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
  validateSession: async () => false,
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
  
  // Refs pour éviter les re-renders et gérer les timeouts
  const sessionCheckInterval = useRef<NodeJS.Timeout | null>(null);
  const validationInProgress = useRef(false);
  const lastValidationTime = useRef<number>(0);

  // Fonction pour vérifier si une session est vraiment valide
  const validateSession = useCallback(async (): Promise<boolean> => {
    if (!supabase || validationInProgress.current) {
      return false;
    }

    // Éviter les validations trop fréquentes (max 1 par minute)
    const now = Date.now();
    if (now - lastValidationTime.current < 60000) {
      return session !== null;
    }

    validationInProgress.current = true;
    lastValidationTime.current = now;

    try {
      logger.debug("[auth] Validating session...");
      
      // 1. Vérifier d'abord la session locale
      const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        logger.error("[auth] Session validation error:", sessionError);
        return false;
      }

      if (!currentSession) {
        logger.debug("[auth] No session found during validation");
        return false;
      }

      // 2. Vérifier si la session est expirée
      const expiresAt = currentSession.expires_at ? new Date(currentSession.expires_at * 1000) : null;
      const now = new Date();
      
      if (expiresAt && expiresAt <= now) {
        logger.debug("[auth] Session expired, attempting refresh...");
        
        // Tenter un refresh
        const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
        
        if (refreshError || !refreshedSession) {
          logger.warn("[auth] Session refresh failed:", refreshError);
          return false;
        }
        
        logger.debug("[auth] Session refreshed successfully");
      }

      // 3. Test de connectivité avec une requête simple
      const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !currentUser) {
        logger.warn("[auth] User validation failed:", userError);
        return false;
      }

      // 4. Test d'accès aux données (optionnel mais recommandé)
      try {
        const { error: profileError } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', currentUser.id)
          .limit(1)
          .single();
          
        if (profileError && profileError.code !== 'PGRST116') {
          logger.warn("[auth] Profile access test failed:", profileError);
          // Ne pas considérer comme échec critique, juste un avertissement
        }
      } catch (profileTestError) {
        logger.warn("[auth] Profile test error (non-critical):", profileTestError);
      }

      logger.debug("[auth] Session validation successful");
      return true;

    } catch (error) {
      logger.error("[auth] Session validation error:", error);
      return false;
    } finally {
      validationInProgress.current = false;
    }
  }, [session]);

  // Fonction pour récupérer le statut d'abonnement avec validation complète
  const fetchSubscriptionStatus = useCallback(async (userId: string, retryCount = 0) => {
    const maxRetries = 3;
    
    if (!supabase) {
      logger.warn("[auth] Client Supabase indisponible pour récupérer l'abonnement");
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
    if (!supabase) {
      logger.warn("[auth] Client Supabase indisponible pour créer le profil");
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

  // Fonction pour rafraîchir l'abonnement et le profil
  const refreshSubscription = useCallback(async () => {
    if (user) {
      await fetchSubscriptionStatus(user.id);
      // Également déclencher un refresh du profil si d'autres composants l'écoutent
      window.dispatchEvent(new CustomEvent('profileRefresh', { detail: { userId: user.id } }));
    }
  }, [user, fetchSubscriptionStatus]);

  const signOut = async () => {
    if (!supabase) {
      logger.warn("[auth] Client Supabase indisponible pour la déconnexion");
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

      // Nettoyer l'interval de vérification
      if (sessionCheckInterval.current) {
        clearInterval(sessionCheckInterval.current);
        sessionCheckInterval.current = null;
      }

      // Nettoyage immédiat du state
      setUser(null);
      setSession(null);
      setHasActiveSubscription(false);
      setSubscriptionStatus(null);
      setSubscriptionEnd(null);
      setLoading(false);

      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (e) {
        logger.warn("Storage clear error:", e);
      }

      try {
        const channels = supabase.getChannels();
        for (const channel of channels) {
          await supabase.removeChannel(channel);
        }
      } catch (e) {
        logger.warn("Error removing channels:", e);
      }

      setTimeout(async () => {
        try {
          await supabase.auth.signOut({ scope: "global" });
        } catch (e) {
          logger.warn("SignOut error:", e);
        }
      }, 0);

      window.location.replace("/");
    } catch (error) {
      logger.error("Critical logout error:", error);
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
  };

  useEffect(() => {
    let mounted = true;
    let authSubscription: any = null;

    // AMÉLIORATION: Surveillance plus intelligente de la session
    const startSessionMonitoring = () => {
      if (sessionCheckInterval.current) {
        clearInterval(sessionCheckInterval.current);
      }
      
      sessionCheckInterval.current = setInterval(async () => {
        if (!mounted || !supabase) return;
        
        try {
          const isValid = await validateSession();
          
          if (!isValid && session) {
            logger.warn("[auth] Session validation failed, signing out...");
            await signOut();
          }
        } catch (error) {
          logger.error("Erreur lors de la vérification de session:", error);
        }
      }, 2 * 60 * 1000); // Vérifier toutes les 2 minutes au lieu de 5
    };

    // AMÉLIORATION: Validation immédiate au retour sur la page
    const handleVisibilityChange = async () => {
      if (!document.hidden && session && mounted) {
        logger.debug("[auth] Page became visible, validating session...");
        
        const isValid = await validateSession();
        if (!isValid) {
          logger.warn("[auth] Session invalid after page focus, signing out...");
          await signOut();
        }
      }
    };

    // Nettoyer l'URL des fragments OAuth
    if (window.location.search.includes('access_token') || window.location.hash.includes('access_token')) {
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);
      logger.debug("OAuth URL cleaned");
    }

    const handleAuthStateChange = async (event: string, session: Session | null) => {
      if (!mounted) return;

      logger.debug("Auth state changed:", event, session?.user?.id);
      
      try {
        if (session && session.user) {
          setSession(session);
          setUser(session.user);
          
          // Démarrer la surveillance et validation immédiate
          startSessionMonitoring();
          
          if (!localStorage.getItem('deletion_in_progress') && 
              !localStorage.getItem('logout_in_progress') &&
              mounted) {
            
            const timeoutId = setTimeout(() => {
              if (mounted) {
                logger.warn("Auth operations timeout, proceeding without profile/subscription");
                setLoading(false);
              }
            }, 10000);

            try {
              // Validation immédiate de la nouvelle session
              const isValid = await validateSession();
              if (!isValid) {
                logger.warn("[auth] New session is invalid");
                throw new Error("Invalid session");
              }

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
          setSession(null);
          setUser(null);
          setHasActiveSubscription(false);
          setSubscriptionStatus(null);
          setSubscriptionEnd(null);
          setLoading(false);
          
          if (sessionCheckInterval.current) {
            clearInterval(sessionCheckInterval.current);
            sessionCheckInterval.current = null;
          }
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

    const initAuth = async () => {
      if (!supabase) {
        logger.warn("[auth] Client Supabase indisponible - authentification désactivée");
        setLoading(false);
        return;
      }
      
      try {
        if (window.location.hash && 
            !window.location.pathname.includes('/auth') && 
            window.location.pathname !== '/goodbye') {
          window.history.replaceState(null, '', window.location.pathname);
        }
        
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          logger.error("Error getting initial session:", error);
        }
        
        // NOUVELLE: Validation immédiate de la session initiale
        if (session) {
          const isValid = await validateSession();
          if (!isValid) {
            logger.warn("[auth] Initial session is invalid, clearing...");
            await supabase.auth.signOut({ scope: "global" });
            await handleAuthStateChange('INVALID_SESSION', null);
            return;
          }
        }
        
        await handleAuthStateChange('INITIAL_SESSION', session);
      } catch (error) {
        logger.error("Auth initialization error:", error);
        if (mounted) {
          setLoading(false);
        }
      }
    };

    try {
      if (supabase) {
        const { data } = supabase.auth.onAuthStateChange(handleAuthStateChange);
        authSubscription = data.subscription;
      }
    } catch (error) {
      logger.error("Error setting up auth state listener:", error);
    }

    // Écouter les changements de visibilité de la page
    document.addEventListener('visibilitychange', handleVisibilityChange);

    initAuth();

    return () => {
      mounted = false;
      
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      
      if (sessionCheckInterval.current) {
        clearInterval(sessionCheckInterval.current);
      }
      
      if (authSubscription) {
        try {
          authSubscription.unsubscribe();
        } catch (error) {
          logger.error("Error unsubscribing from auth:", error);
        }
      }
    };
  }, [ensureProfile, fetchSubscriptionStatus, validateSession]);

  const value = {
    user,
    session,
    loading,
    hasActiveSubscription,
    subscriptionStatus,
    subscriptionEnd,
    refreshSubscription,
    signOut,
    validateSession,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};