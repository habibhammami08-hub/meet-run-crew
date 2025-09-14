import { createContext, useContext, useEffect, useRef, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { getSupabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";

const supabase = getSupabase();

interface AuthContextType {
  authLoading: boolean;
  user: User | null;
  session: Session | null;
  hasActiveSubscription: boolean | null; // null = inconnu, true/false = résolu
  refreshSubscription: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  authLoading: true,
  user: null,
  session: null,
  hasActiveSubscription: null,
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
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [hasActiveSubscription, setHasActiveSubscription] = useState<boolean | null>(null);

  // Évite double-init en StrictMode
  const didInit = useRef(false);

  // Fonction pour récupérer le statut d'abonnement
  const fetchSubscriptionStatus = async (userId: string) => {
    if (!supabase || authLoading) {
      setHasActiveSubscription(null);
      return;
    }
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase
        .from('profiles')
        .select('sub_status, sub_current_period_end')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        logger.warn('Subscription fetch error:', error);
        setHasActiveSubscription(false);
        return;
      }

      if (!data) {
        setHasActiveSubscription(false);
        return;
      }

      const isActiveStatus = ['active', 'trialing'].includes(data.sub_status);
      const isNotExpired = !data.sub_current_period_end || new Date(data.sub_current_period_end) > new Date();
      setHasActiveSubscription(isActiveStatus && isNotExpired);
    } catch (error) {
      logger.error('Error fetching subscription status:', error);
      setHasActiveSubscription(false);
    }
  };

  // Fonction pour rafraîchir l'abonnement
  const refreshSubscription = async () => {
    if (user && !authLoading) {
      await fetchSubscriptionStatus(user.id);
    }
  };

  // Fonction de déconnexion
  const signOut = async () => {
    if (!supabase) {
      setUser(null);
      setSession(null);
      setHasActiveSubscription(null);
      window.location.replace("/");
      return;
    }
    
    try {
      setUser(null);
      setSession(null);
      setHasActiveSubscription(null);
      
      await supabase.auth.signOut({ scope: "global" });
      window.location.replace("/");
    } catch (error) {
      logger.error("Logout error:", error);
      window.location.replace("/");
    }
  };

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    (async () => {
      if (!supabase) {
        setAuthLoading(false);
        return;
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        setUser(session?.user ?? null);
        setSession(session);
        
        // Charger l'abonnement si utilisateur connecté
        if (session?.user) {
          await fetchSubscriptionStatus(session.user.id);
        }
      } catch (error) {
        logger.error("Auth initialization error:", error);
      } finally {
        setAuthLoading(false);
      }
    })();

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      setSession(session);
      
      // Recharger l'abonnement si utilisateur connecté
      if (session?.user && !authLoading) {
        await fetchSubscriptionStatus(session.user.id);
      } else {
        setHasActiveSubscription(null);
      }
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const value = {
    authLoading,
    user,
    session,
    hasActiveSubscription,
    refreshSubscription,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {/* Bloque le rendu app tant que l'auth n'est pas prête */}
      {authLoading ? <div className="flex items-center justify-center min-h-screen p-6">Chargement…</div> : children}
    </AuthContext.Provider>
  );
};