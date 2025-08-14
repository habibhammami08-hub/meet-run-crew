import { createContext, useContext, useEffect, useState, useRef } from "react";
import { User, Session, RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { hasActiveSub } from "@/utils/subscription";

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
  const realtimeSubRef = useRef<RealtimeChannel | null>(null);

  const fetchSubscriptionStatus = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('sub_status, sub_current_period_end')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching subscription status:', error);
        return;
      }

      // Use the hasActiveSub helper function
      const isActive = hasActiveSub(data);
      
      setHasActiveSubscription(isActive);
      setSubscriptionStatus(data.sub_status);
      setSubscriptionEnd(data.sub_current_period_end);
    } catch (error) {
      console.error('Error in fetchSubscriptionStatus:', error);
    }
  };

  const refreshSubscription = async () => {
    if (user) {
      await fetchSubscriptionStatus(user.id);
    }
  };

  // Stable Realtime subscription for profile updates
  useEffect(() => {
    if (!user?.id || realtimeSubRef.current) {
      console.log('Skipping realtime setup - user:', !!user?.id, 'existing sub:', !!realtimeSubRef.current);
      return;
    }

    console.log('Setting up Realtime subscription for profile updates');
    realtimeSubRef.current = supabase
      .channel(`profile:${user.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${user.id}`
      }, (payload) => {
        console.log('Profile updated via Realtime:', payload.new);
        const updatedProfile = payload.new as any;
        const isActive = hasActiveSub(updatedProfile);
        setHasActiveSubscription(isActive);
        setSubscriptionStatus(updatedProfile.sub_status);
        setSubscriptionEnd(updatedProfile.sub_current_period_end);
      })
      .subscribe((status) => {
        console.log('Realtime subscription status:', status);
      });

    return () => {
      console.log('Cleaning up Realtime subscription');
      if (realtimeSubRef.current) {
        realtimeSubRef.current.unsubscribe();
        realtimeSubRef.current = null;
      }
    };
  }, [user?.id]); // Only depend on user.id, not other state

  // Auth state management (separate from profile subscription)
  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          await fetchSubscriptionStatus(session.user.id);
        } else {
          setHasActiveSubscription(false);
          setSubscriptionStatus(null);
          setSubscriptionEnd(null);
        }
        
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        await fetchSubscriptionStatus(session.user.id);
      }
      
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    try {
      // Clean up Realtime subscription first
      if (realtimeSubRef.current) {
        console.log('Cleaning up Realtime subscription during signout');
        realtimeSubRef.current.unsubscribe();
        realtimeSubRef.current = null;
      }
      
      // Clear local state first
      setUser(null);
      setSession(null);
      setHasActiveSubscription(false);
      setSubscriptionStatus(null);
      setSubscriptionEnd(null);
      
      // Then sign out from Supabase
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Signout error:', error);
        // Even if signOut fails, force redirect to clear state
      }
      
      // Force navigation to home page
      window.location.href = '/';
    } catch (error) {
      console.error('Unexpected signout error:', error);
      // Force clear everything and redirect anyway
      setUser(null);
      setSession(null);
      setHasActiveSubscription(false);
      setSubscriptionStatus(null);
      setSubscriptionEnd(null);
      window.location.href = '/';
    }
  };

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