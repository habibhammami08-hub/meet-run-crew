import { createContext, useContext, useEffect, useState, useCallback } from "react";
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

  // Fonction pour sauvegarder les données de reconnexion
  const saveReconnectionData = useCallback(async () => {
    console.log("[auth] saveReconnectionData called", { user: user?.id, session: !!session });
    
    if (!user || !session || !supabase) {
      console.log("[auth] Missing data for reconnection save:", { user: !!user, session: !!session, supabase: !!supabase });
      return;
    }
    
    try {
      const reconnectionData = {
        email: user.email,
        refreshToken: session.refresh_token,
        timestamp: Date.now(),
        userId: user.id
      };
      
      localStorage.setItem('meetrun_reconnection', JSON.stringify(reconnectionData));
      console.log("[auth] Reconnection data saved successfully:", { email: user.email, timestamp: reconnectionData.timestamp });
    } catch (error) {
      console.error("[auth] Failed to save reconnection data:", error);
    }
  }, [user, session]);

  // Fonction pour tenter la reconnexion automatique
  const attemptAutoReconnection = useCallback(async (): Promise<boolean> => {
    console.log("[auth] attemptAutoReconnection called");
    
    if (!supabase) {
      console.log("[auth] No supabase client");
      return false;
    }
    
    try {
      const savedData = localStorage.getItem('meetrun_reconnection');
      console.log("[auth] Saved reconnection data:", savedData);
      
      if (!savedData) {
        console.log("[auth] No reconnection data found");
        return false;
      }
      
      const reconnectionData = JSON.parse(savedData);
      const now = Date.now();
      const twentyFourHours = 24 * 60 * 60 * 1000;
      const timeDiff = now - reconnectionData.timestamp;
      
      console.log("[auth] Time difference:", timeDiff, "24h limit:", twentyFourHours);
      
      // Vérifier si moins de 24h se sont écoulées
      if (timeDiff > twentyFourHours) {
        console.log("[auth] Reconnection data expired, cleaning up");
        localStorage.removeItem('meetrun_reconnection');
        return false;
      }
      
      console.log("[auth] Attempting auto-reconnection with refresh token");
      
      // Utiliser refreshSession au lieu de setSession
      const { data, error } = await supabase.auth.refreshSession({
        refresh_token: reconnectionData.refreshToken
      });
      
      if (error || !data.session) {
        console.log("[auth] Auto-reconnection failed:", error);
        localStorage.removeItem('meetrun_reconnection');
        return false;
      }
      
      console.log("✅ [auth] AUTO-RECONNECTION SUCCESSFUL for user:", reconnectionData.email);
      localStorage.removeItem('meetrun_reconnection'); // Nettoyer après succès
      return true;
      
    } catch (error) {
      console.error("[auth] Auto-reconnection error:", error);
      localStorage.removeItem('meetrun_reconnection');
      return false;
    }
  }, []);

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

      // Nettoyer le localStorage immédiatement (y compris les données de reconnexion)
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
          const { data: { session }, error } = await supabase.auth.getSession();
          
          if (error) {
            logger.warn("Session check error:", error);
            return;
          }
          
          // Vérifier si la session est proche de l'expiration (dans les 10 prochaines minutes)
          if (session?.expires_at) {
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
          logger.error("Erreur lors de la vérification de session:", error);
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

    // CORRECTION: Initialisation avec gestion d'erreur améliorée
    const initAuth = async () => {
      console.log("[auth] initAuth called");
      
      if (!supabase) {
        console.warn("[auth] Client Supabase indisponible - authentification désactivée");
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
        
        console.log("[auth] Checking for auto-reconnection...");
        // D'abord tenter la reconnexion automatique
        const autoReconnected = await attemptAutoReconnection();
        if (autoReconnected) {
          console.log("[auth] Auto-reconnection completed successfully");
          return; // La session sera gérée par onAuthStateChange
        }
        
        console.log("[auth] No auto-reconnection, getting current session");
        // Si pas de reconnexion auto, procéder normalement
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error("Error getting initial session:", error);
        }
        
        console.log("[auth] Current session:", session?.user?.id ?? 'none');
        await handleAuthStateChange('INITIAL_SESSION', session);
      } catch (error) {
        console.error("Auth initialization error:", error);
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
  }, [ensureProfile, fetchSubscriptionStatus, attemptAutoReconnection]);

  // Déconnexion automatique à la fermeture d'onglet
  useEffect(() => {
    const handlePageUnload = async () => {
      if (user && supabase) {
        logger.debug("[auth] Page unload detected - saving reconnection data and signing out");
        
        // Sauvegarder les données de reconnexion AVANT la déconnexion
        await saveReconnectionData();
        
        // Nettoyage immédiat du state local
        setUser(null);
        setSession(null);
        setHasActiveSubscription(false);
        setSubscriptionStatus(null);
        setSubscriptionEnd(null);
        
        // Nettoyage du storage SAUF les données de reconnexion
        try {
          const reconnectionData = localStorage.getItem('meetrun_reconnection');
          localStorage.clear();
          sessionStorage.clear();
          // Restaurer les données de reconnexion après le clear
          if (reconnectionData) {
            localStorage.setItem('meetrun_reconnection', reconnectionData);
          }
        } catch (e) {
          logger.warn("Storage clear error on unload:", e);
        }
        
        // Déconnexion Supabase synchrone pour la fermeture d'onglet
        try {
          await supabase.auth.signOut({ scope: "global" });
        } catch (signOutError) {
          logger.warn("SignOut error on unload:", signOutError);
        }
      }
    };
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && user) {
        logger.debug("[auth] Page hidden - preparing for potential unload");
        // Sauvegarder préventivement au cas où l'onglet serait fermé brutalement
        saveReconnectionData();
      }
    };
    
    // Écouter les événements de fermeture d'onglet
    window.addEventListener('beforeunload', handlePageUnload);
    window.addEventListener('pagehide', handlePageUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      window.removeEventListener('beforeunload', handlePageUnload);
      window.removeEventListener('pagehide', handlePageUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, saveReconnectionData]);

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