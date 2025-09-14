// path: src/hooks/useAuth.tsx
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { getSupabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";

const supabase = getSupabase();

interface AuthContextType {
  user: User | null | undefined; // undefined = auth en cours, null = non connecté, User = connecté
  session: Session | null;
  loading: boolean;
  hasActiveSubscription: boolean;
  subscriptionStatus: string | null;
  subscriptionEnd: string | null;
  refreshSubscription: () => Promise<void>;
  signOut: () => Promise<void>;
  ensureFreshSession: () => Promise<Session | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: undefined,
  session: null,
  loading: true,
  hasActiveSubscription: false,
  subscriptionStatus: null,
  subscriptionEnd: null,
  refreshSubscription: async () => {},
  signOut: async () => {},
  ensureFreshSession: async () => null,
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

// Utils internes
const isSessionStale = (s: Session | null | undefined, thresholdMs = 60_000) => {
  if (!s?.expires_at) return true;
  const msLeft = s.expires_at * 1000 - Date.now();
  return msLeft < thresholdMs;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [subscriptionEnd, setSubscriptionEnd] = useState<string | null>(null);

  // ----- Subscription fetch -----
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

  // ----- Ensure profile -----
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

  // ----- NEW: ensureFreshSession -----
  const ensureFreshSession = useCallback(async (): Promise<Session | null> => {
    if (!supabase) return null;
    try {
      // 1) récupérer la session actuelle
      const { data: { session: current }, error } = await supabase.auth.getSession();
      if (error) logger.warn("[auth] getSession error:", error);

      // 2) si absente ou périmée/proche expiration -> refresh
      if (!current || isSessionStale(current)) {
        logger.info("[auth] Session absente/expirante -> refreshSession()");
        const { data, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) {
          logger.warn("[auth] refreshSession error:", refreshError);
          // Si refresh échoue, considérer non connecté
          setSession(null);
          setUser(null);
          return null;
        }
        // Mettre à jour l'état local
        if (data.session) {
          setSession(data.session);
          setUser(data.session.user ?? null);
        }
        return data.session ?? null;
      }

      // 3) session valide -> synchroniser user si besoin
      if (current && !user) {
        setUser(current.user ?? null);
      }
      if (current && !session) setSession(current);
      return current;
    } catch (e) {
      logger.error("[auth] ensureFreshSession fatal:", e);
      return null;
    }
  }, [session, user]);

  // ----- Refresh & monitoring -----
  const refreshSubscription = useCallback(async () => {
    if (user && user.id) {
      await fetchSubscriptionStatus(user.id);
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
      } catch {}
      window.location.replace("/");
    }
  };

  // ----- Listeners focus/visibility pour réhydratation rapide -----
  useEffect(() => {
    const onFocusOrVisible = async () => {
      await ensureFreshSession(); // force refresh si nécessaire
      if (user?.id) {
        // Optionnel: revalider l’abonnement au retour
        fetchSubscriptionStatus(user.id);
      }
    };
    window.addEventListener("focus", onFocusOrVisible);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") onFocusOrVisible();
    });
    return () => {
      window.removeEventListener("focus", onFocusOrVisible);
      document.removeEventListener("visibilitychange", () => {});
    };
  }, [ensureFreshSession, fetchSubscriptionStatus, user?.id]);

  // ----- Init auth + monitoring périodique -----
  useEffect(() => {
    let mounted = true;
    let authSubscription: any = null;
    let sessionCheckInterval: NodeJS.Timeout | null = null;

    const startSessionMonitoring = () => {
      if (sessionCheckInterval) clearInterval(sessionCheckInterval);
      sessionCheckInterval = setInterval(async () => {
        if (!mounted || !supabase) return;
        try {
          const { data: { session }, error } = await supabase.auth.getSession();
          if (error) {
            logger.warn("Session check error:", error);
            return;
          }
          if (isSessionStale(session, 10 * 60 * 1000)) {
            logger.info("Session proche de l'expiration, tentative de renouvellement");
            try {
              await supabase.auth.refreshSession();
              logger.info("Session renouvelée avec succès");
            } catch (refreshError) {
              logger.error("Erreur lors du renouvellement de session:", refreshError);
            }
          }
        } catch (error) {
          logger.error("Erreur lors de la vérification de session:", error);
        }
      }, 5 * 60 * 1000);
    };

    if (window.location.search.includes('access_token') || window.location.hash.includes('access_token')) {
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);
      logger.debug("OAuth URL cleaned");
    }

    const handleAuthStateChange = async (_event: string, newSession: Session | null) => {
      if (!mounted) return;
      logger.debug("Auth state changed:", _event, newSession?.user?.id);

      try {
        if (newSession?.user) {
          setSession(newSession);
          setUser(newSession.user);
          startSessionMonitoring();

          // Couche de sécurité: ensureFreshSession tout de suite
          await ensureFreshSession();

          const timeoutId = setTimeout(() => {
            if (mounted) {
              logger.warn("Auth operations timeout, proceeding without profile/subscription");
              setLoading(false);
            }
          }, 10000);

          try {
            await ensureProfile(newSession.user);
            if (mounted) await fetchSubscriptionStatus(newSession.user.id);
          } catch (error) {
            logger.error("Auth async operations error:", error);
          } finally {
            clearTimeout(timeoutId);
            if (mounted) setLoading(false);
          }
        } else {
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
        if (mounted) setLoading(false);
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

        // NEW: forcer une réhydratation/refresh si besoin
        const fresh = await ensureFreshSession();
        await handleAuthStateChange('INITIAL_SESSION', fresh);
      } catch (error) {
        logger.error("Auth initialization error:", error);
        setLoading(false);
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

    initAuth();

    return () => {
      mounted = false;
      if (sessionCheckInterval) clearInterval(sessionCheckInterval);
      if (authSubscription) {
        try {
          authSubscription.unsubscribe();
        } catch (error) {
          logger.error("Error unsubscribing from auth:", error);
        }
      }
    };
  }, [ensureProfile, fetchSubscriptionStatus, ensureFreshSession]);

  const value = {
    user,
    session,
    loading,
    hasActiveSubscription,
    subscriptionStatus,
    subscriptionEnd,
    refreshSubscription,
    signOut,
    ensureFreshSession,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
