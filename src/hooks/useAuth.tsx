// src/hooks/useAuth.tsx
import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { getSupabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";

const supabase = getSupabase();

interface AuthContextType {
  user: User | null | undefined; // undefined = en cours d'init
  session: Session | null;
  loading: boolean;
  hasActiveSubscription: boolean;
  subscriptionStatus: string | null;
  subscriptionEnd: string | null;
  refreshSubscription: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Force a validation/refresh now (useful before critical queries) */
  validateSessionNow: () => Promise<void>;
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
  validateSessionNow: async () => {},
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [subscriptionEnd, setSubscriptionEnd] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const sessionCheckInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchSubscriptionStatus = useCallback(async (userId: string, retryCount = 0) => {
    const maxRetries = 3;
    if (!supabase) {
      logger.warn("[auth] Supabase indisponible pour récupérer l'abonnement");
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
      logger.debug('[auth] Subscription status:', { status, computedActiveSubscription });
    } catch (error) {
      logger.error('Error in fetchSubscriptionStatus:', error);
      setHasActiveSubscription(false);
      setSubscriptionStatus(null);
      setSubscriptionEnd(null);
    }
  }, []);

  /** Returns true if refreshed successfully (or not needed) */
  const refreshIfNeeded = useCallback(async (): Promise<boolean> => {
    if (!supabase) return false;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const now = Date.now();
      const exp = session?.expires_at ? session.expires_at * 1000 : 0;

      // si pas de session => rien à rafraîchir
      if (!session) return true;

      // refresh si expiré ou < 10 min
      if (exp - now < 10 * 60 * 1000) {
        logger.info("[auth] Session near/after expiry -> refreshing");
        const { data, error } = await supabase.auth.refreshSession();
        if (error) {
          logger.error("[auth] refreshSession error:", error);
          return false;
        }
        // update local state with fresh session
        setSession(data.session);
        setUser(data.session?.user ?? null);
      }
      return true;
    } catch (e) {
      logger.error("[auth] refreshIfNeeded error:", e);
      return false;
    }
  }, []);

  const validateSessionNow = useCallback(async () => {
    // Force un check + refresh immédiat, utilisé par les pages avant requêtes critiques
    await refreshIfNeeded();
  }, [refreshIfNeeded]);

  const ensureProfile = useCallback(async (u: User) => {
    if (!supabase) return;
    try {
      const { data: existingProfile, error: selectError } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', u.id)
        .maybeSingle();

      if (selectError && selectError.code !== 'PGRST116') throw selectError;

      if (!existingProfile) {
        const profileData = {
          id: u.id,
          email: u.email || '',
          full_name: u.user_metadata?.full_name || u.user_metadata?.name || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
          .from('profiles')
          .upsert(profileData, { onConflict: 'id', ignoreDuplicates: false })
          .select()
          .single();

        if (error) throw error;
        logger.debug("[profile] created:", data);
        return data;
      }
      return existingProfile;
    } catch (error) {
      logger.error("[profile] ensureProfile error:", error);
      throw error;
    }
  }, []);

  const refreshSubscription = useCallback(async () => {
    if (user && user !== undefined) {
      await fetchSubscriptionStatus(user.id);
      window.dispatchEvent(new CustomEvent('profileRefresh', { detail: { userId: user.id } }));
    }
  }, [user, fetchSubscriptionStatus]);

  const signOut = useCallback(async () => {
    if (!supabase) {
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
        for (const ch of channels) await supabase.removeChannel(ch);
      } catch (e) {
        logger.warn("Error removing channels:", e);
      }

      // signOut réel (non bloquant pour l’UX)
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
  }, []);

  const handleAuthStateChange = useCallback(async (event: string, sess: Session | null) => {
    if (!mountedRef.current) return;
    logger.debug("Auth state changed:", event, sess?.user?.id);

    try {
      if (sess?.user) {
        setSession(sess);
        setUser(sess.user);

        // démarrer/relancer la surveillance de session
        if (sessionCheckInterval.current) clearInterval(sessionCheckInterval.current);
        sessionCheckInterval.current = setInterval(async () => {
          if (!mountedRef.current) return;
          await refreshIfNeeded();
        }, 5 * 60 * 1000);

        // Validation / initial fetch
        const ok = await refreshIfNeeded();
        if (!ok) {
          // refresh KO => mettre l'état déconnecté
          setSession(null);
          setUser(null);
          setHasActiveSubscription(false);
          setSubscriptionStatus(null);
          setSubscriptionEnd(null);
          setLoading(false);
          return;
        }

        try {
          await ensureProfile(sess.user);
          await fetchSubscriptionStatus(sess.user.id);
        } catch (e) {
          logger.error("Post sign-in ops error:", e);
        } finally {
          setLoading(false);
        }
      } else {
        // Aucune session valide
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
      logger.error("Error in auth state handler:", error);
      setSession(null);
      setUser(null);
      setHasActiveSubscription(false);
      setSubscriptionStatus(null);
      setSubscriptionEnd(null);
      setLoading(false);
    }
  }, [ensureProfile, fetchSubscriptionStatus, refreshIfNeeded]);

  useEffect(() => {
    mountedRef.current = true;

    const init = async () => {
      if (!supabase) {
        logger.warn("[auth] Supabase indisponible");
        setUser(null);
        setLoading(false);
        return;
      }

      // Nettoyer URL OAuth si besoin
      if (window.location.search.includes('access_token') || window.location.hash.includes('access_token')) {
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);
        logger.debug("OAuth URL cleaned");
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();

        // Forcer validation/refresh immédiat au cold start (onglet rouvert)
        await refreshIfNeeded();

        await handleAuthStateChange('INITIAL_SESSION', session);
      } catch (e) {
        logger.error("Auth init error:", e);
        setUser(null);
        setLoading(false);
      }
    };

    let unsubscribe: (() => void) | null = null;

    (async () => {
      try {
        const { data } = supabase.auth.onAuthStateChange(handleAuthStateChange);
        unsubscribe = () => data.subscription.unsubscribe();
      } catch (e) {
        logger.error("Error setting auth listener:", e);
      } finally {
        await init();
      }
    })();

    return () => {
      mountedRef.current = false;
      if (sessionCheckInterval.current) {
        clearInterval(sessionCheckInterval.current);
        sessionCheckInterval.current = null;
      }
      if (unsubscribe) {
        try { unsubscribe(); } catch {}
      }
    };
  }, [handleAuthStateChange, refreshIfNeeded]);

  const value: AuthContextType = {
    user,
    session,
    loading,
    hasActiveSubscription,
    subscriptionStatus,
    subscriptionEnd,
    refreshSubscription,
    signOut,
    validateSessionNow,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
