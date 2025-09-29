// src/hooks/useAuth.ts
import { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabase } from "@/integrations/supabase/client";

type Profile = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  stripe_customer_id?: string | null;
  sub_status?: string | null;
  sub_current_period_end?: string | null;
  updated_at?: string | null;
};

type AuthCtx = {
  ready: boolean;
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
  if (!end) return true;
  return new Date(end) > new Date();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabase();

  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const mountedRef = useRef(false);
  const loadingRef = useRef(false);

  // 🔧 FIX: Accepte un userId en paramètre pour éviter les problèmes de closure
  const fetchProfile = async (userId: string) => {
    try {
      loadingRef.current = true;
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, stripe_customer_id, sub_status, sub_current_period_end, updated_at, email")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        console.warn("[useAuth] profiles fetch error:", error.message);
        setProfile((p) => p ?? null);
      } else {
        setProfile((data as Profile) ?? null);
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  };

  // Wrapper pour l'API publique (utilise user actuel)
  const refreshProfile = async () => {
    if (!user) {
      setProfile(null);
      return;
    }
    await fetchProfile(user.id);
  };

  // Réconciliation initiale de la session + profil
  useEffect(() => {
    mountedRef.current = true;

    (async () => {
      try {
        // 1) Récupère la session persistée
        const { data } = await supabase.auth.getSession();
        const sessUser = data?.session?.user ?? null;
        setUser(sessUser);

        // 2) Si connecté → charge le profil AVEC l'ID récupéré
        if (sessUser) {
          await fetchProfile(sessUser.id);
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

    // 4) Abonnement aux changements d'auth
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);

      // 🔧 FIX: Utilise directement nextUser au lieu de user
      if (nextUser) {
        await fetchProfile(nextUser.id);
      } else {
        setProfile(null);
      }
      setReady(true);
    });

    return () => {
      mountedRef.current = false;
      sub?.subscription?.unsubscribe();
    };
  }, [supabase]); // ✅ Dépendances correctes

  // 5) Rafraîchit quand l'onglet redevient visible
  useEffect(() => {
    const onVisible = async () => {
      if (document.visibilityState === "visible" && user) {
        try {
          await supabase.auth.refreshSession();
        } catch {}
        await fetchProfile(user.id);
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user, supabase]); // ✅ Dépendances correctes

  // 🔴 Realtime : écoute les changements de *ton* profil
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`realtime-profile-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as Profile | undefined;
          if (row) {
            setProfile((prev) => ({ ...(prev ?? {} as Profile), ...row }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, supabase]);

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