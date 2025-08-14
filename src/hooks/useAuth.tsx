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

  // Sync user metadata to profile table
  const syncUserMetadataToProfile = async (user: User) => {
    try {
      const metadata = user.user_metadata;
      if (!metadata) return;

      const profileData = {
        id: user.id,
        email: user.email || '',
        full_name: metadata.full_name || '',
        phone: metadata.phone || null,
        age: metadata.age ? Number(metadata.age) : null,
        gender: metadata.gender || null,
      };

      console.log('Syncing user metadata to profile:', profileData);

      const { error } = await supabase
        .from('profiles')
        .upsert(profileData, { onConflict: 'id' });

      if (error) {
        console.error('Error syncing metadata to profile:', error);
      } else {
        console.log('User metadata synced to profile successfully');
      }
    } catch (error) {
      console.error('Error in syncUserMetadataToProfile:', error);
    }
  };

  // Realtime subscription to get live profile updates
  const subRef = useRef<RealtimeChannel | null>(null);
  useEffect(() => {
    if (!user?.id || subRef.current) return; // empêche les doubles subs
    console.log("[profile] Setting up Realtime subscription for profile updates");
    subRef.current = supabase
      .channel("me:profile")
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
        (payload) => {
          console.log("[profile] Realtime update:", payload.new);
          const updatedProfile = payload.new as any;
          const isActive = hasActiveSub(updatedProfile);
          setHasActiveSubscription(isActive);
          setSubscriptionStatus(updatedProfile.sub_status);
          setSubscriptionEnd(updatedProfile.sub_current_period_end);
        }
      )
      .subscribe((status) => console.log("Realtime subscription status:", status));

    return () => {
      console.log("[profile] Cleaning up Realtime subscription");
      subRef.current?.unsubscribe();
      subRef.current = null;
    };
  }, [user?.id]);

  // Auth state management (separate from profile subscription)
  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          await fetchSubscriptionStatus(session.user.id);
          // Sync user metadata to profile on login
          if (event === 'SIGNED_IN') {
            await syncUserMetadataToProfile(session.user);
          }
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
        // Also sync metadata on initial load
        await syncUserMetadataToProfile(session.user);
      }
      
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    try {
      // Clean up Realtime subscription first
      if (subRef.current) {
        console.log('Cleaning up Realtime subscription during signout');
        subRef.current.unsubscribe();
        subRef.current = null;
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