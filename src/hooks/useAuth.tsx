// src/hooks/useAuth.tsx
import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import type { User, Session } from "@supabase/supabase-js";
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

  // Anti-rebond pour refreshs agressifs (retour onglet, etc.)
  const lastRefreshRef = useRef<number>(0);
  const mountedRef = useRef<boolean>(true);
  const sessionCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const authSubRef = useRef<{ unsubscribe: () => void } | null>(null);

  const safeRefreshSession = useCallback(async (reason: string) => {
    if (!supabase || !mountedRef.current) return;
    const now = Date.now();
    if (now - lastRefreshRef.current < 60_000) {
      logger.debug(`[auth] refresh skipped (cooldown) • reason=${reason}`);
      return;
    }
    try {
      logger.debug(`[auth] refreshSession() • reason=${reason}`);
      lastRefreshRef.current = now;
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        logger.warn("[auth] refreshSession error:", error);
        return;
      }
      if (data?.session) {
        setSession(data.session);
        setUser(data.session.user ?? null);
      }
    } catch (e) {
      logger.error("[auth] refreshSession fatal error:", e);
    }
  }, []);

  // -------- Subscription status ----------
  const fetchSubscriptionStatus = useCallback(async (userId: string, retryCount = 0) => {
    const maxRetries = 3;
    if (!supabase) {
      logger.warn("[auth] Client Supabase indisponible pour récupérer l'abonnement");
      return;
    }
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("sub_status, sub_current_period_end")
        .eq("id", userId)
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
        logger.warn("No profile found for user:", userId);
        setHasActiveSubscription(false);
        setSubscriptionStatus(null);
        setSubscriptionEnd(null);
        return;
      }

      const validStatuses = ["active", "trialing", "canceled", "past_due", "incomplete"];
      const status = validStatuses.includes(data.sub_status) ? data.sub_status : "inactive";
      const isActiveStatus = ["active", "trialing"].includes(status);
      const isNotExpired =
        !data.sub_current_period_end || new Date(data.sub_current_period_end) > new Date();
      const computedActiveSubscription = isActiveStatus && isNotExpired;

      setHasActiveSubscription(computedActiveSubscription);
      setSubscriptionStatus(status);
      setSubscriptionEnd(data.sub_current_period_end);

      logger.debug("Subscription status updated:", {
        status,
        isActiveStatus,
        isNotExpired,
        hasActiveSubscription: computedActiveSubscription,
      });
    } catch (error) {
      logger.error("Error in fetchSubscriptionStatus:", error);
      setHasActiveSubscription(false);
      setSubscriptionStatus(null);
      setSubscriptionEnd(null);
    }
  }, []);

  // -------- Ensure profile exists ----------
  const ensureProfile = useCallback(async (u: User) => {
    if (!supabase) {
      logger.warn("[auth] Client Supabase indisponible pour créer le profil");
      return;
    }
    try {
      const { data: existingProfile, error: selectError } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", u.id)
        .maybeSingle();

      if (selectError && (selectError as any).code !== "PGRST116") {
        throw selectError;
      }

      if (!existingProfile) {
        const profileData = {
          id: u.id,
          email: u.email || "",
          full_name: u.user_metadata?.full_name || u.user_metadata?.name || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
          .from("profiles")
          .upsert(profileData, {
            onConflict: "id",
            ignoreDuplicates: false,
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

  const refreshSubscription = useCallback(async () => {
    if (user) {
      await fetchSubscriptionStatus(user.id);
      window.dispatchEvent(new CustomEvent("profileRefresh", { detail: { userId: user.id } }));
    }
  }, [user, fetchSubscriptionStatus]);

  // -------- Sign out ----------
  const signOut = useCallback(async () => {
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
      // Flag clair (tu le testais déjà)
      try {
        localStorage.setItem("logout_in_progress", "1");
      } catch {}

      // Reset local state immédiatement
      setUser(null);
      setSession(null);
      setHasActiveSubscription(false);
      setSubscriptionStatus(null);
      setSubscriptionEnd(null);
      setLoading(false);

      // Nettoyer canaux
      try {
        const channels = supabase.getChannels();
        for (const ch of channels) await supabase.removeChannel(ch);
      } catch (e) {
        logger.warn("Error removing channels:", e);
      }

      // Signout global (non bloquant)
      setTimeout(async () => {
        try {
          await supabase.auth.signOut({ scope: "global" });
        } catch (e) {
          logger.warn("SignOut error:", e);
        }
      }, 0);

      // Nettoyage storage après signOut (et pour propager aux autres onglets)
      try {
        localStorage.removeItem("logout_in_progress");
        localStorage.setItem("logged_out_at", String(Date.now()));
        sessionStorage.clear();
      } catch {}

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
        localStorage.removeItem("logout_in_progress");
        sessionStorage.clear();
      } catch {}
      window.location.replace("/");
    }
  }, []);

  // -------- Handle auth state changes ----------
  const handleAuthStateChange = useCallback(
    async (event: string, newSession: Session | null) => {
      if (!mountedRef.current) return;
      logger.debug("Auth state changed:", event, newSession?.user?.id);

      try {
        if (newSession && newSession.user) {
          setSession(newSession);
          setUser(newSession.user);

          // Sanity check: s'assurer que le token est toujours utilisable
          try {
            const { data: userCheck, error: userErr } = await supabase.auth.getUser();
            if (userErr || !userCheck?.user) {
              // Token invalide/inutilisable → on tente un refresh immédiat
              logger.warn("[auth] getUser failed after state change → refreshing");
              await safeRefreshSession("auth_state_change_invalid_user");
            }
          } catch (e) {
            logger.warn("[auth] getUser fatal during state change:", e);
          }

          // Ensure profile + subscription
          const timeoutId = setTimeout(() => {
            if (mountedRef.current) {
              logger.warn("Auth ops timeout → continue without profile/subscription");
              setLoading(false);
            }
          }, 10_000);

          try {
            await ensureProfile(newSession.user);
            if (mountedRef.current) {
              await fetchSubscriptionStatus(newSession.user.id);
            }
          } catch (e) {
            logger.error("Auth async operations error:", e);
          } finally {
            clearTimeout(timeoutId);
            if (mountedRef.current) setLoading(false);
          }
        } else {
          // Déconnecté
          setSession(null);
          setUser(null);
          setHasActiveSubscription(false);
          setSubscriptionStatus(null);
          setSubscriptionEnd(null);
          if (mountedRef.current) setLoading(false);
        }
      } catch (error) {
        logger.error("Error in auth state change handler:", error);
        setSession(null);
        setUser(null);
        setHasActiveSubscription(false);
        setSubscriptionStatus(null);
        setSubscriptionEnd(null);
        if (mountedRef.current) setLoading(false);
      }
    },
    [ensureProfile, fetchSubscriptionStatus, safeRefreshSession]
  );

  // -------- Init & listeners ----------
  useEffect(() => {
    mountedRef.current = true;

    const startSessionMonitoring = () => {
      if (sessionCheckIntervalRef.current) {
        clearInterval(sessionCheckIntervalRef.current);
      }
      sessionCheckIntervalRef.current = setInterval(async () => {
        if (!mountedRef.current || !supabase) return;
        try {
          const { data: { session } = { session: null } } = await supabase.auth.getSession();
          const exp = session?.expires_at ? new Date(session.expires_at * 1000) : null;
          if (exp) {
            const soon = new Date(Date.now() + 10 * 60 * 1000);
            if (exp < soon) {
              await safeRefreshSession("interval_expiring");
            }
          }
        } catch (e) {
          logger.warn("[auth] periodic session check error:", e);
        }
      }, 5 * 60 * 1000);
    };

    // Nettoyer URL OAuth résiduels
    try {
      if (
        window.location.search.includes("access_token") ||
        window.location.hash.includes("access_token")
      ) {
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, "", cleanUrl);
        logger.debug("OAuth URL cleaned");
      }
      if (
        window.location.hash &&
        !window.location.pathname.includes("/auth") &&
        window.location.pathname !== "/goodbye"
      ) {
        window.history.replaceState(null, "", window.location.pathname);
      }
    } catch {}

    // Initialisation: on récupère la session, puis on force un refresh proactif
    (async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) logger.error("Error getting initial session:", error);

        await handleAuthStateChange("INITIAL_SESSION", session ?? null);

        // refresh immédiat si on revient après un moment (évite faux "connecté")
        await safeRefreshSession("init_mount");
        startSessionMonitoring();
      } catch (e) {
        logger.error("Auth initialization error:", e);
        if (mountedRef.current) setLoading(false);
      }
    })();

    // Listener auth
    try {
      if (supabase) {
        const { data } = supabase.auth.onAuthStateChange((e, s) =>
          handleAuthStateChange(e, s)
        );
        authSubRef.current = data.subscription;
      }
    } catch (e) {
      logger.error("Error setting up auth state listener:", e);
    }

    // Listener visibilité → refresh à la remontée d’onglet
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        safeRefreshSession("visibilitychange_visible");
        // rafraîchir l’abonnement silencieusement
        if (user?.id) fetchSubscriptionStatus(user.id);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Propagation inter-onglets: si un autre onglet se déconnecte
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === "logged_out_at" && ev.newValue) {
        logger.info("[auth] detected sign-out in another tab");
        setUser(null);
        setSession(null);
        setHasActiveSubscription(false);
        setSubscriptionStatus(null);
        setSubscriptionEnd(null);
        setLoading(false);
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      mountedRef.current = false;

      if (sessionCheckIntervalRef.current) {
        clearInterval(sessionCheckIntervalRef.current);
        sessionCheckIntervalRef.current = null;
      }
      if (authSubRef.current) {
        try {
          authSubRef.current.unsubscribe();
        } catch (e) {
          logger.error("Error unsubscribing from auth:", e);
        }
        authSubRef.current = null;
      }
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("storage", onStorage);
    };
  }, [fetchSubscriptionStatus, handleAuthStateChange, safeRefreshSession, user?.id]);

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

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
