import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";

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

  // Fonction pour récupérer le statut d'abonnement
  const fetchSubscriptionStatus = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('sub_status, sub_current_period_end')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        logger.error('Subscription fetch error:', error);
        setHasActiveSubscription(false);
        setSubscriptionStatus(null);
        setSubscriptionEnd(null);
        return;
      }

      if (!data) {
        logger.warn('No profile found for user:', userId);
        setHasActiveSubscription(false);
        setSubscriptionStatus(null);
        setSubscriptionEnd(null);
        return;
      }

      const isActive = data.sub_status === 'active' || data.sub_status === 'trialing';
      const isNotExpired = !data.sub_current_period_end || new Date(data.sub_current_period_end) > new Date();
      
      setHasActiveSubscription(isActive && isNotExpired);
      setSubscriptionStatus(data.sub_status);
      setSubscriptionEnd(data.sub_current_period_end);
    } catch (error) {
      logger.error('Error in fetchSubscriptionStatus:', error);
      setHasActiveSubscription(false);
      setSubscriptionStatus(null);
      setSubscriptionEnd(null);
    }
  }, []);

  // Fonction pour s'assurer qu'un profil existe (plus nécessaire - trigger DB le fait)
  const ensureProfile = useCallback(async (user: User) => {
    // Cette fonction est maintenant obsolète car le trigger DB crée automatiquement le profil
    // Mais on garde la fonction pour éviter les erreurs et on log juste si le profil existe
    try {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();

      if (existingProfile) {
        logger.debug("Existing profile found for:", user.id);
      } else {
        logger.warn("Missing profile for:", user.id, "- should be created by DB trigger");
      }
    } catch (error) {
      logger.error("Profile verification error:", error);
    }
  }, []);

  // Fonction pour rafraîchir l'abonnement
  const refreshSubscription = useCallback(async () => {
    if (user) {
      await fetchSubscriptionStatus(user.id);
    }
  }, [user, fetchSubscriptionStatus]);

  const signOut = async () => {
    try {
      setLoading(true);
      logger.debug("Starting logout process...");

      try {
        // @ts-ignore
        supabase.realtime.removeAllChannels?.();
        // @ts-ignore
        supabase.realtime.disconnect?.();
      } catch {}

      try { 
        await supabase.auth.signOut({ scope: "local" }); 
      } catch {}
      
      try { 
        await supabase.auth.signOut({ scope: "global" }); 
      } catch (e) { 
        logger.warn("Global signOut error:", e); 
      }

      try { 
        localStorage.clear(); 
        sessionStorage.clear(); 
      } catch {}

      try {
        // @ts-ignore
        if (indexedDB && typeof indexedDB.databases === "function") {
          // @ts-ignore
          const dbs = await indexedDB.databases();
          for (const db of dbs) { 
            if (db.name) indexedDB.deleteDatabase(db.name); 
          }
        }
      } catch {}
    } catch (error) {
      logger.error("Critical logout error:", error);
    } finally {
      setLoading(false);
      window.location.pathname = "/";
    }
  };

  useEffect(() => {
    let mounted = true;

    // Nettoyer l'URL des fragments OAuth AVANT d'écouter les auth events
    if (window.location.search.includes('access_token') || window.location.hash.includes('access_token')) {
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);
      logger.debug("OAuth URL cleaned");
    }

    // Fonction pour gérer les changements d'état d'auth (synchrone uniquement pour éviter deadlocks)
    const handleAuthStateChange = (event: string, session: Session | null) => {
      if (!mounted) return;

      logger.debug("Auth state changed:", event, session?.user?.id);
      
      // Synchronous state update
      setSession(session);
      setUser(session?.user ?? null);
      
      // Don't recreate profile if deletion or logout in progress
      if (session?.user && !localStorage.getItem('deletion_in_progress') && !localStorage.getItem('logout_in_progress')) {
        // Defer Supabase calls to avoid deadlocks
        setTimeout(() => {
          if (mounted) {
            ensureProfile(session.user)
              .then(() => fetchSubscriptionStatus(session.user.id))
              .catch((error) => {
                logger.error("Auth async operations error:", error);
              })
              .finally(() => {
                if (mounted) setLoading(false);
              });
          }
        }, 100);
      } else if (!session?.user) {
        setLoading(false);
      }
    };

    // Écouter les changements d'état d'authentification
    const { data: { subscription } } = supabase.auth.onAuthStateChange(handleAuthStateChange);

    // Vérifier la session existante
    const initAuth = async () => {
      try {
        // Nettoyer l'URL de fragments OAuth avant d'initialiser l'auth
        if (window.location.hash && window.location.pathname !== '/goodbye') {
          window.history.replaceState(null, '', window.location.pathname);
        }
        
        const { data: { session } } = await supabase.auth.getSession();
        handleAuthStateChange('INITIAL_SESSION', session);
      } catch (error) {
        logger.error("Auth initialization error:", error);
        setLoading(false);
      }
    };

    initAuth();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [ensureProfile, fetchSubscriptionStatus]);

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