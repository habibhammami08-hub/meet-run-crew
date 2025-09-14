import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { getSupabase, getCurrentUserSafe } from "@/integrations/supabase/client";
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
    let sessionCheckInterval: NodeJS.Timeout | null = null;

    // CORRECTION: Surveillance périodique de la session (toutes les 5 minutes)
    const startSessionMonitoring = () => {
      if (sessionCheckInterval) {
        clearInterval(sessionCheckInterval);
      }
      
      sessionCheckInterval = setInterval(async () => {
        if (!mounted || !supabase) return;
        
        try {
          // 🔒 validation réseau — si ça échoue, on déconnecte proprement
          const { user } = await getCurrentUserSafe({ timeoutMs: 5000 });
          if (!user) {
            logger.warn("Session monitoring: user validation failed, signing out");
            await handleAuthStateChange('SESSION_BECAME_INVALID', null);
            try { 
              await supabase.auth.signOut({ scope: "local" }); 
            } catch {}
            return;
          }

          // Vérifier si la session est proche de l'expiration (dans les 10 prochaines minutes)
          const { data: { session }, error } = await supabase.auth.getSession();
          if (!error && session?.expires_at) {
            const expiresAt = new Date(session.expires_at * 1000);
            const now = new Date();
            const tenMinutesFromNow = new Date(now.getTime() + 10 * 60 * 1000);
            
            if (expiresAt < tenMinutesFromNow) {
              logger.info("Session proche de l'expiration, tentative de renouvellement");
              try {
                await supabase.auth.refreshSession();
                logger.info("Session renouvelée avec succès");
              } catch (refreshError) {
                logger.error("Erreur lors du renouvellement de session:", refreshError);
              }
            }
          }
        } catch (error) {
          logger.warn("Session monitor error:", error);
        }
      }, 5 * 60 * 1000); // Vérifier toutes les 5 minutes
    };

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
          
          // Démarrer la surveillance de session uniquement si connecté
          startSessionMonitoring();
          
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
          
          // Arrêter la surveillance de session si déconnecté
          if (sessionCheckInterval) {
            clearInterval(sessionCheckInterval);
            sessionCheckInterval = null;
          }
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

    // ✅ Initialisation fiable avec validation réseau
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
        
        // ✅ validation réseau (gère aussi un refresh si besoin)
        const { user } = await getCurrentUserSafe({ timeoutMs: 6000 });

        if (user) {
          const { data: { session } } = await supabase.auth.getSession();
          await handleAuthStateChange('INITIAL_SESSION_VALIDATED', session);
        } else {
          // ❌ session locale invalide → on nettoie
          await handleAuthStateChange('INITIAL_SESSION_INVALID', null);
          try {
            await supabase.auth.signOut({ scope: "local" });
          } catch {}
          localStorage.removeItem("supabase.auth.token");
        }
      } catch (error) {
        logger.error("Auth initialization error:", error);
        if (mounted) {
          setLoading(false);
        }
      }
    };

    // Revalider quand l'app revient au premier plan
    const onVisible = async () => {
      if (!supabase || document.hidden || !user) return;
      logger.debug("App became visible, validating session...");
      
      const { user: validatedUser } = await getCurrentUserSafe({ timeoutMs: 5000 });
      if (!validatedUser) {
        logger.warn("Visibility revalidation failed, signing out");
        await handleAuthStateChange('VISIBILITY_REVALIDATION_FAILED', null);
        try { 
          await supabase.auth.signOut({ scope: "local" }); 
        } catch {}
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

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    initAuth();

    return () => {
      mounted = false;
      
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      
      // Nettoyer l'interval de surveillance de session
      if (sessionCheckInterval) {
        clearInterval(sessionCheckInterval);
      }
      
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