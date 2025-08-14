import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

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
        console.error('Erreur récupération abonnement:', error);
        setHasActiveSubscription(false);
        setSubscriptionStatus(null);
        setSubscriptionEnd(null);
        return;
      }

      if (!data) {
        console.warn('Aucun profil trouvé pour l\'utilisateur:', userId);
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
      console.error('Erreur dans fetchSubscriptionStatus:', error);
      setHasActiveSubscription(false);
      setSubscriptionStatus(null);
      setSubscriptionEnd(null);
    }
  }, []);

  // Fonction pour s'assurer qu'un profil existe
  const ensureProfile = useCallback(async (user: User) => {
    try {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();

      if (!existingProfile) {
        // Créer le profil s'il n'existe pas
        const { error } = await supabase
          .from('profiles')
          .upsert({
            id: user.id,
            email: user.email || '',
            full_name: user.user_metadata?.full_name || '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }, { onConflict: 'id' });

        if (error) {
          console.error("Erreur création profil:", error);
        } else {
          console.log("[auth] Profil créé pour l'utilisateur");
        }
      }
    } catch (error) {
      console.error("Erreur vérification profil:", error);
    }
  }, []);

  // Fonction pour rafraîchir l'abonnement
  const refreshSubscription = useCallback(async () => {
    if (user) {
      await fetchSubscriptionStatus(user.id);
    }
  }, [user, fetchSubscriptionStatus]);

  // Fonction de déconnexion corrigée
  const signOut = async () => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Erreur déconnexion:", error);
      }
    } catch (error) {
      console.error("Erreur critique déconnexion:", error);
    } finally {
      // Redirection forcée même en cas d'erreur
      setUser(null);
      setSession(null);
      setHasActiveSubscription(false);
      setSubscriptionStatus(null);
      setSubscriptionEnd(null);
      setLoading(false);
      
      // Redirection vers la page d'accueil
      window.location.href = "/";
    }
  };

  useEffect(() => {
    let mounted = true;

    // Fonction pour gérer les changements d'état d'auth (synchrone uniquement pour éviter deadlocks)
    const handleAuthStateChange = (event: string, session: Session | null) => {
      if (!mounted) return;

      console.log("[auth] État changé:", event, session?.user?.id);
      
      // Mise à jour synchrone de l'état
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        // Différer les appels Supabase pour éviter les deadlocks
        setTimeout(() => {
          if (mounted) {
            ensureProfile(session.user)
              .then(() => fetchSubscriptionStatus(session.user.id))
              .catch((error) => {
                console.error("[auth] Erreur async operations:", error);
              })
              .finally(() => {
                if (mounted) setLoading(false);
              });
          }
        }, 0);
      } else {
        // Réinitialiser l'état si pas d'utilisateur
        setHasActiveSubscription(false);
        setSubscriptionStatus(null);
        setSubscriptionEnd(null);
        setLoading(false);
      }
    };

    // Écouter les changements d'état d'authentification
    const { data: { subscription } } = supabase.auth.onAuthStateChange(handleAuthStateChange);

    // Vérifier la session existante
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        handleAuthStateChange('INITIAL_SESSION', session);
      } catch (error) {
        console.error("Erreur initialisation auth:", error);
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