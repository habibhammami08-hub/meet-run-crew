// src/hooks/useAuth.ts
import { useEffect, useState } from "react";
import { getSupabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export function useAuth() {
  const [user, setUser] = useState<any>(undefined); // undefined = loading, null = not authenticated
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const supabase = getSupabase();

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      setUser(null);
      return;
    }

    // Fonction pour vérifier et créer le profil si nécessaire
    const ensureProfile = async (user: any) => {
      if (!user?.id) return;
      
      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (!profile && !error) {
          // Créer le profil s'il n'existe pas
          await supabase.from('profiles').upsert({
            id: user.id,
            email: user.email || '',
            full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Runner',
            age: user.user_metadata?.age || null,
            gender: user.user_metadata?.gender || null,
            phone: user.user_metadata?.phone || null,
            sessions_hosted: 0,
            sessions_joined: 0,
            total_km: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }
      } catch (error) {
        console.error('Error ensuring profile exists:', error);
      }
    };

    // Fonction pour vérifier le statut d'abonnement
    const checkSubscriptionStatus = async (userId: string) => {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('sub_status, sub_current_period_end')
          .eq('id', userId)
          .maybeSingle();

        if (profile) {
          const hasActive = profile.sub_status === 'active' && 
                           profile.sub_current_period_end && 
                           new Date(profile.sub_current_period_end) > new Date();
          setHasActiveSubscription(hasActive);
        }
      } catch (error) {
        console.error('Error checking subscription:', error);
        setHasActiveSubscription(false);
      }
    };

    // Obtenir la session initiale
    const getInitialSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Error getting session:', error);
          setUser(null);
        } else if (session?.user) {
          console.log('Initial session found:', session.user.id);
          setUser(session.user);
          await ensureProfile(session.user);
          await checkSubscriptionStatus(session.user.id);
        } else {
          console.log('No initial session found');
          setUser(null);
        }
      } catch (error) {
        console.error('Error in getInitialSession:', error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    getInitialSession();

    // Écouter les changements d'authentification
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.id || 'no user');
      
      switch (event) {
        case 'SIGNED_IN':
          if (session?.user) {
            setUser(session.user);
            await ensureProfile(session.user);
            await checkSubscriptionStatus(session.user.id);
            
            // Toast de bienvenue uniquement pour les nouvelles connexions
            if (!loading) {
              toast({
                title: "Connexion réussie",
                description: "Bienvenue sur MeetRun !",
              });
            }
          }
          break;
          
        case 'SIGNED_OUT':
          setUser(null);
          setHasActiveSubscription(false);
          break;
          
        case 'TOKEN_REFRESHED':
          if (session?.user) {
            setUser(session.user);
            await checkSubscriptionStatus(session.user.id);
          }
          break;
          
        case 'USER_UPDATED':
          if (session?.user) {
            setUser(session.user);
            await ensureProfile(session.user);
            await checkSubscriptionStatus(session.user.id);
          }
          break;
      }
      
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, toast, loading]);

  const signOut = async () => {
    if (!supabase) return;
    
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      toast({
        title: "Déconnexion réussie",
        description: "À bientôt sur MeetRun !",
      });
    } catch (error: any) {
      toast({
        title: "Erreur de déconnexion",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return {
    user,
    loading,
    hasActiveSubscription,
    signOut,
  };
}