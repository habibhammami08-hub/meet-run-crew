// path: src/pages/Home.tsx
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Users, Calendar, Star, Trash2, Crown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { getSupabase } from "@/integrations/supabase/client";
import { useEffect, useState, useCallback, useRef } from "react";
import heroImage from "@/assets/hero-background.jpg";
import logoImage from "@/assets/meetrun-logo.png";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/utils/logger";

const Home = () => {
  const navigate = useNavigate();
  const { user, signOut, hasActiveSubscription, ensureFreshSession } = useAuth();
  const { toast } = useToast();
  const [userActivity, setUserActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);

  const supabase = getSupabase();

  const mountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout>();

  const fetchUserActivity = useCallback(async (userId: string) => {
    if (!supabase || !userId || !mountedRef.current) return;

    // 🔐 NEW: s’assurer que la session est fraîche
    await ensureFreshSession();

    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setLoading(true);
    try {
      const { data: createdSessions, error: sessionsError } = await supabase
        .from('sessions')
        .select(`*, enrollments(count)`)
        .eq('host_id', userId)
        .order('scheduled_at', { ascending: false })
        .limit(3);

      if (signal.aborted || !mountedRef.current) return;

      const { data: enrolledSessions } = await supabase
        .from('enrollments')
        .select(`*, sessions(*)`)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(3);

      if (signal.aborted || !mountedRef.current) return;

      const activities: any[] = [];
      if (createdSessions) {
        activities.push(...createdSessions.map(session => ({
          ...session,
          activity_type: 'created',
          activity_date: session.created_at
        })));
      }
      if (enrolledSessions) {
        activities.push(...enrolledSessions.map(enrollment => ({
          ...enrollment.sessions,
          enrollment_status: enrollment.status,
          activity_type: 'joined',
          activity_date: enrollment.created_at
        })));
      }
      activities.sort((a, b) => new Date(b.activity_date).getTime() - new Date(a.activity_date).getTime());
      if (!signal.aborted && mountedRef.current) {
        setUserActivity(activities.slice(0, 5));
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') logger.error('[Home] Error loading activities:', error);
    } finally {
      if (!signal.aborted && mountedRef.current) setLoading(false);
    }
  }, [supabase, ensureFreshSession]);

  useEffect(() => {
    if (user?.id && mountedRef.current) fetchUserActivity(user.id);
  }, [user?.id, fetchUserActivity]);

  const debouncedRefresh = useCallback(() => {
    if (!user?.id || !mountedRef.current) return;
    clearTimeout(debounceTimeoutRef.current);
    debounceTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current && user?.id) fetchUserActivity(user.id);
    }, 2000);
  }, [user?.id, fetchUserActivity]);

  useEffect(() => {
    if (!user?.id) return;
    const handleProfileRefresh = () => {
      if (mountedRef.current) debouncedRefresh();
    };
    window.addEventListener('profileRefresh', handleProfileRefresh);
    return () => window.removeEventListener('profileRefresh', handleProfileRefresh);
  }, [debouncedRefresh, user?.id]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimeout(debounceTimeoutRef.current);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  const handleDeleteSession = async (sessionId: string) => {
    if (!user || !mountedRef.current) return;

    if (!confirm("Êtes-vous sûr de vouloir supprimer cette session ? Cette action est irréversible.")) {
      return;
    }

    setDeletingSessionId(sessionId);
    try {
      await ensureFreshSession(); // 🔐 NEW
      const { error } = await supabase.from('sessions').delete().eq('id', sessionId);
      if (error) throw error;

      if (mountedRef.current) {
        toast({ title: "Session supprimée", description: "La session a été supprimée avec succès." });
        if (user.id) fetchUserActivity(user.id);
      }
    } catch (error: any) {
      if (mountedRef.current) {
        toast({ title: "Erreur de suppression", description: error.message, variant: "destructive" });
      }
    } finally {
      if (mountedRef.current) setDeletingSessionId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-white border-b border-border px-4 py-3">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <img src={logoImage} alt="MeetRun Logo" className="h-8 w-auto" />
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <Button variant="ghost" onClick={() => navigate("/profile")}>Profil</Button>
                <Button variant="ghost" onClick={signOut}>Déconnexion</Button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => navigate("/auth?returnTo=/")} className="text-primary font-semibold">
                  Se connecter
                </Button>
                <Button variant="sport" onClick={() => navigate("/auth?mode=signup&returnTo=/")}>
                  S'inscrire
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="main-content">
        {/* Hero Section */}
        <div className="relative h-[50vh] overflow-hidden">
          <img src={heroImage} alt="MeetRun - Marche, cours, rencontre" className="w-full h-full object-cover"/>
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/55 to-black/35" />
          <div className="absolute inset-0 flex flex-col justify-center items-center text-white p-6">
            <h1 className="text-4xl font-bold mb-2 text-center">MeetRun</h1>
            <p className="text-lg font-bold opacity-95 mb-6 text-center">Marche. Cours. Rencontre.</p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button variant="sport" size="lg" onClick={() => navigate("/map")} className="font-semibold px-8 py-4 rounded-xl shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-300 bg-gradient-to-r from-primary to-primary-variant border-2 border-white/20 backdrop-blur-sm">
                Voir les courses
              </Button>
              <Button variant="sport" size="lg" onClick={() => navigate(user ? "/create" : "/auth?returnTo=/create")} className="font-semibold px-8 py-4 rounded-xl shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-300 bg-gradient-to-r from-primary to-primary-variant border-2 border-white/20 backdrop-blur-sm">
                Créer une course
              </Button>
            </div>
          </div>
        </div>

        {/* How it works */}
        <div className="p-6">
          <h2 className="text-2xl font-bold text-center mb-8 text-foreground">Comment ça marche ?</h2>
          {/* ... (section inchangée) ... */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Button variant="sportSecondary" size="lg" className="font-semibold shadow-lg hover:shadow-xl transition-all duration-300" onClick={() => navigate("/map")}>
              Voir toutes les courses
            </Button>
            <Button variant="sport" size="lg" className="font-semibold shadow-lg hover:shadow-xl transition-all duration-300" onClick={() => navigate("/subscription")}>
              <Crown size={16} className="mr-2" />
              S'abonner maintenant
            </Button>
          </div>
        </div>

        {!hasActiveSubscription && (
          <div className="p-6">
            {/* ... (CTA inchangé) ... */}
          </div>
        )}

        {user && (
          <div className="p-6 pt-0">
            {/* ... (activité récente identique, appels supabase déjà protégés plus haut) ... */}
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;
