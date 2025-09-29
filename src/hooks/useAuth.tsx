// src/hooks/useAuth.ts
import { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabase } from "@/integrations/supabase/client";

type Profile = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  stripe_customer_id?: string | null;
  sub_status?: string | null; // 'active' | 'trialing' | 'canceled' | null ...
  sub_current_period_end?: string | null; // ISO string
  updated_at?: string | null;
};

type AuthCtx = {
  ready: boolean;           // vrai quand session restaurée ET (si connecté) profil chargé
  loading: boolean;
  user: User | null;
  profile: Profile | null;
  hasActiveSubscription: boolean;
  subscriptionStatus: string | null;
  subscriptionEnd: string | null;
  refreshProfile: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

function isSubActive(status?: string | null, end?: string | null) {
  if (status !== "active") return false;
  if (!end) return false;
  return new Date(end) > new Date();
}

function shallowChanged(a?: Profile | null, b?: Profile | null) {
  if (!a && !b) return false;
  if (!a || !b) return true;
  return (
    a.sub_status !== b.sub_status ||
    a.sub_current_period_end !== b.sub_current_period_end ||
    a.updated_at !== b.updated_at ||
    a.stripe_customer_id !== b.stripe_customer_id
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabase();

  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const isMounted = useRef(false);
  const fetchingRef = useRef<Promise<void> | null>(null);
  const realtimeSubRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastFetchAtRef = useRef<number>(0);

  const fetchProfile = async (uid: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, stripe_customer_id, sub_status, sub_current_period_end, updated_at, email")
      .eq("id", uid)
      .maybeSingle();

    if (error) {
      console.warn("[useAuth] profiles fetch error:", error.message);
      return;
    }
    setProfile((prev) => (shallowChanged(prev, data as Profile) ? ((data as Profile) ?? null) : prev));
  };

  const refreshProfile = async () => {
    if (!user) {
      setProfile(null);
      return;
    }
    // anti-spam (1500ms)
    const now = Date.now();
    if (now - lastFetchAtRef.current < 1500 && fetchingRef.current) {
      await fetchingRef.current.catch(() => {});
      return;
    }
    lastFetchAtRef.current = now;

    const p = (async () => {
      setLoading(true);
      try {
        await fetchProfile(user.id);
      } finally {
        setLoading(false);
      }
    })();

    fetchingRef.current = p;
    await p.catch(() => {});
    fetchingRef.current = null;
  };

  // Abonnement realtime au profil connecté (sans boucle)
  const subscribeToProfile = (uid: string) => {
    // cleanup ancien channel
    realtimeSubRef.current?.unsubscribe();
    realtimeSubRef.current = null;

    const channel = supabase
      .channel(`public:profiles:id=eq.${uid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles", filter: `id=eq.${uid}` },
        (payload) => {
          // on met à jour localement uniquement si changement
          const newRow = payload.new as Profile | undefined;
          if (newRow) {
            setProfile((prev) => (shallowChanged(prev, newRow) ? newRow : prev));
          } else {
            // si delete (peu probable), on refetch propre
            refreshProfile().catch(() => {});
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // optionnel : refetch pour aligner asap au premier abonnement
          refreshProfile().catch(() => {});
        }
      });

    realtimeSubRef.current = channel;
  };

  // Réconciliation initiale session + profil
  useEffect(() => {
    isMounted.current = true;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const sessUser = data?.session?.user ?? null;
        setUser(sessUser);

        if (sessUser) {
          await refreshProfile();
          subscribeToProfile(sessUser.id);
        } else {
          setProfile(null);
        }
      } catch (e) {
        console.warn("[useAuth] getSession error:", e);
      } finally {
        setReady(true);
        setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);

      // (ré)abonne le canal realtime proprement
      if (nextUser) {
        subscribeToProfile(nextUser.id);
        await refreshProfile();
      } else {
        realtimeSubRef.current?.unsubscribe();
        realtimeSubRef.current = null;
        setProfile(null);
      }
      setReady(true);
    });

    const onVisible = async () => {
      if (document.visibilityState === "visible") {
        try {
          await supabase.auth.refreshSession();
        } catch {}
        if (user) await refreshProfile();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      isMounted.current = false;
      sub?.subscription?.unsubscribe();
      realtimeSubRef.current?.unsubscribe();
      realtimeSubRef.current = null;
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshSubscription = async () => {
    await refreshProfile();
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setReady(true);
  };

  const hasActiveSubscription = useMemo(
    () => isSubActive(profile?.sub_status ?? null, profile?.sub_current_period_end ?? null),
    [profile?.sub_status, profile?.sub_current_period_end]
  );

  const value: AuthCtx = {
    ready,
    loading,
    user,
    profile,
    hasActiveSubscription,
    subscriptionStatus: profile?.sub_status ?? null,
    subscriptionEnd: profile?.sub_current_period_end ?? null,
    refreshProfile,
    refreshSubscription,
    signOut,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
