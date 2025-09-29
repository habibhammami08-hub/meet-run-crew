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
  ready: boolean;           // <-- vrai quand la session est restaurée ET (si connecté) le profil est chargé
  loading: boolean;         // loader ponctuel
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabase();

  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const mountedRef = useRef(false);
  const loadingRef = useRef(false);

  // Charge/rafraîchit le profil (séparé pour être réutilisé)
  const refreshProfile = async () => {
    if (!user) {
      setProfile(null);
      return;
    }
    try {
      loadingRef.current = true;
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, stripe_customer_id, sub_status, sub_current_period_end, updated_at, email")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        console.warn("[useAuth] profiles fetch error:", error.message);
        // IMPORTANT : on n’entretient pas un profil potentiellement obsolète
        setProfile(null);
      } else {
        setProfile((data as Profile) ?? null);
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
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

        // 2) Si connecté → charge le profil
        if (sessUser) {
          await refreshProfile();
        } else {
          setProfile(null);
        }
      } catch (e) {
        console.warn("[useAuth] getSession error:", e);
      } finally {
        // 3) Marque le contexte comme prêt (pages peuvent démarrer)
        setReady(true);
        setLoading(false);
      }
    })();

    // 4) Abonnement aux changements d'auth
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);

      // En cas de SIGNED_IN / TOKEN_REFRESHED / etc. → recharge le profil
      if (nextUser) {
        await refreshProfile();
      } else {
        setProfile(null);
      }
      setReady(true);
    });

    // 🔔 Realtime : se mettre à jour dès qu’une UPDATE touche la ligne du user
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        const uid = u?.user?.id;
        if (uid) {
          channel = supabase
            .channel("profile-sub")
            .on(
              "postgres_changes",
              { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${uid}` },
              (payload: any) => {
                setProfile((prev) => ({ ...(prev ?? {} as any), ...(payload.new as any) }));
              }
            )
            .subscribe();
        }
      } catch (e) {
        console.warn("[useAuth] realtime subscribe error:", e);
      }
    })();

    // 5) Rafraîchit quand l'onglet redevient visible (utile après long sommeil)
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
      mountedRef.current = false;
      sub?.subscription?.unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshSubscription = async () => {
    // force un refetch du profil (utilisé après un retour Stripe ou un webhook)
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
