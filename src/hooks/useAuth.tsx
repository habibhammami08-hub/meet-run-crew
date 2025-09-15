// src/hooks/useAuth.tsx
import { useEffect, useMemo, useState, useCallback, createContext, useContext } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { getSupabase } from "@/integrations/supabase/client";

type Profile = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  stripe_customer_id?: string | null;
  sub_status?: string | null; // 'active' | 'trialing' | 'canceled' | ...
  sub_current_period_end?: string | null;
  updated_at?: string | null;
};

type AuthContextShape = {
  user: User | null;
  session: Session | null;
  loading: boolean;

  profile: Profile | null;
  hasActiveSubscription: boolean;
  subscriptionStatus: string | null;
  subscriptionEnd: string | null;

  refreshProfile: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextShape>({
  user: null,
  session: null,
  loading: true,

  profile: null,
  hasActiveSubscription: false,
  subscriptionStatus: null,
  subscriptionEnd: null,

  refreshProfile: async () => {},
  refreshSubscription: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = getSupabase();

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);

  const [profile, setProfile] = useState<Profile | null>(null);

  const fetchProfile = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id,email,full_name,stripe_customer_id,sub_status,sub_current_period_end,updated_at")
      .eq("id", uid)
      .maybeSingle<Profile>();
    if (!error) setProfile(data ?? null);
  }, [supabase]);

  // Initialisation: lit la session depuis localStorage et s'abonne à l'auto-refresh
  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data: si } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(si.session ?? null);
      setUser(si.session?.user ?? null);
      if (si.session?.user) await fetchProfile(si.session.user.id);
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession ?? null);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        await fetchProfile(newSession.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, [supabase, fetchProfile]);

  const hasActiveSubscription = useMemo(() => {
    if (!profile?.sub_status || !profile?.sub_current_period_end) return false;
    if (profile.sub_status !== "active") return false;
    const end = new Date(profile.sub_current_period_end);
    return end.getTime() > Date.now();
  }, [profile]);

  const subscriptionStatus = profile?.sub_status ?? null;
  const subscriptionEnd = profile?.sub_current_period_end ?? null;

  const refreshProfile = useCallback(async () => {
    if (user?.id) await fetchProfile(user.id);
  }, [user?.id, fetchProfile]);

  const refreshSubscription = refreshProfile;

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
    setUser(null);
  }, [supabase]);

  const value: AuthContextShape = {
    user,
    session,
    loading,

    profile,
    hasActiveSubscription,
    subscriptionStatus,
    subscriptionEnd,

    refreshProfile,
    refreshSubscription,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
