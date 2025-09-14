import { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type AuthCtx = {
  authLoading: boolean;
  user: any | null;
  hasActiveSubscription: boolean | null;
  refreshSubscription: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<any | null>(null);
  const [hasSub, setHasSub] = useState<boolean | null>(null);

  // Watchdog anti-bloquage: si au bout de 3s on est tjs loading, on débloque le rendu
  const watchdog = useRef<number | null>(null);

  useEffect(() => {
    let unsub: (() => void) | null = null;
    let cancelled = false;

    console.log("[Auth] init start");

    // 1) Watchdog
    watchdog.current = window.setTimeout(() => {
      if (authLoading) {
        console.warn("[Auth] watchdog fired -> forcing authLoading=false to avoid deadlock");
        setAuthLoading(false);
      }
    }, 3000);

    // 2) Init session + subscription to auth changes
    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) console.error("[Auth] getSession error:", error);
        console.log("[Auth] getSession:", data?.session?.user?.id ?? null);
        if (!cancelled) setUser(data?.session?.user ?? null);
      } catch (e) {
        console.error("[Auth] getSession threw:", e);
      } finally {
        // on passe authLoading à false quoi qu'il arrive
        if (!cancelled) setAuthLoading(false);
      }

      const { data: sub } = supabase.auth.onAuthStateChange((evt, sess) => {
        console.log("[Auth] onAuthStateChange:", evt, sess?.user?.id ?? null);
        if (!cancelled) setUser(sess?.user ?? null);
      });

      unsub = () => sub.subscription.unsubscribe();
    })();

    return () => {
      cancelled = true;
      if (unsub) unsub();
      if (watchdog.current) {
        clearTimeout(watchdog.current);
        watchdog.current = null;
      }
      console.log("[Auth] cleanup");
    };
  }, []);

  async function refreshSubscription() {
    if (!user) { setHasSub(false); return; }
    try {
      const { data: sdata } = await supabase.auth.getSession();
      const token = sdata?.session?.access_token ?? "";
      if (!token) {
        console.warn("[Auth] refreshSubscription: no token");
        setHasSub(false);
        return;
      }
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-subscription`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        console.warn("[Auth] get-subscription non-200:", res.status);
        setHasSub(false);
        return;
      }
      const json = await res.json();
      setHasSub(Boolean(json?.active));
    } catch (e) {
      console.error("[Auth] refreshSubscription error:", e);
      setHasSub(false);
    }
  }

  async function signOut() {
    try {
      setUser(null);
      setHasSub(null);
      await supabase.auth.signOut({ scope: "global" });
      window.location.replace("/");
    } catch (error) {
      console.error("[Auth] signOut error:", error);
      window.location.replace("/");
    }
  }

  // 🔴 Ne bloque pas indéfiniment : montre un mini loader, mais grâce au watchdog, ça sort en 3s max
  return (
    <AuthContext.Provider value={{
      authLoading,
      user,
      hasActiveSubscription: hasSub,
      refreshSubscription,
      signOut
    }}>
      {authLoading ? <div className="p-6 text-sm text-gray-500">Initialisation…</div> : children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // Si tu vois ce log: le Provider n'entoure pas ton App
    console.error("[Auth] useAuth called outside AuthProvider");
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
};