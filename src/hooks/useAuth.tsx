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

// ✅ Considère 'active' OU 'trialing' comme abonné.
//    Et n'exige PAS la date de fin (certains webhooks ne la posent pas tout de suite).
function isSubActive(status?: string | null, end?: string | null) {
  if (!status) return false;
  const s = status.trim().toLowerCase();
  if (s === "active" || s === "trialing") return true;
  return false;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabase();

  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const mountedRef = useRef(false);
  const loadingRef = useRef(false);

  // --- Helpers de log (désactive si tu veux)
  const log = (...args: any[]) => {
    // console.log("[useAuth]", ...args);
  };

  // Charge/rafraîchit le profil
  const refreshProfile = async (skipLoadingState = false) => {
    if (!user) {
      setProfile(null);
      return;
    }
    
    const shouldSetLoading = !skipLoadingState && !loadingRef.current;
    
    try {
      if (shouldSetLoading) {
        loadingRef.current = true;
        setLoading(true);
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, stripe_customer_id, sub_status, sub_current_period_end, updated_at, email")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        console.warn("[useAuth] profiles fetch error:", error.message);
        // ne touche pas au profile si erreur réseau passagère
        return;
      }

      if (data) {
        log("Fetched profile:", data);
        setProfile(data as Profile);
      } else {
        setProfile(null);
      }
    } finally {
      if (shouldSetLoading) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  };

  // Réconciliation initiale de la session + profil
  useEffect(() => {
    mountedRef.current = true;

    (async () => {
      try {
        // ✅ On met loading à true AVANT de charger pour éviter les race conditions
        setLoading(true);
        loadingRef.current = true;
        
        const { data } = await supabase.auth.getSession();
        const sessUser = data?.session?.user ?? null;
        setUser(sessUser);

        if (sessUser) {
          // ✅ Passer skipLoadingState=true car on gère déjà loading dans ce useEffect
          await refreshProfile(true);
        } else {
          setProfile(null);
        }
      } catch (e) {
        console.warn("[useAuth] getSession error:", e);
      } finally {
        // ✅ On passe ready=true ET loading=false APRÈS le chargement complet du profil
        setReady(true);
        setLoading(false);
        loadingRef.current = false;
      }
    })();

    // Abonnement aux changements d'auth
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);

      if (nextUser) {
        // Pas de skipLoadingState ici car c'est un changement d'état auth
        await refreshProfile();
      } else {
        setProfile(null);
      }
      setReady(true);
    });

    // Rafraîchir quand l'onglet redevient visible
    const onVisible = async () => {
      if (document.visibilityState === "visible") {
        try {
          await supabase.auth.refreshSession();
        } catch {}
        if (user) await refreshProfile(); // Pas de skipLoadingState ici
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      mountedRef.current = false;
      sub?.subscription?.unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 🔴 Ajoute un listener Realtime Postgres sur la ligne de profil
  //     pour répercuter instantanément les updates du webhook Stripe.
  useEffect(() => {
    if (!user) return;
    // IMPORTANT : il faut que 'profiles' soit bien dans la publication supabase_realtime (tu l'as déjà ajouté)
    const channel = supabase
      .channel(`realtime-profiles-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${user.id}`,
        },
        (payload: any) => {
          // payload.new contient la ligne après update
          const next = payload?.new;
          if (next) {
            log("Realtime profiles change:", next);
            setProfile((prev) => {
              // Évite de reset si rien ne change
              if (!prev) return next as Profile;
              // Merge simple pour garder les autres champs
              return { ...prev, ...(next as Profile) };
            });
          }
        }
      )
      .subscribe((status) => {
        log("Realtime subscription status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

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