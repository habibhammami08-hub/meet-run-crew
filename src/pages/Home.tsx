// src/pages/Home.tsx
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Users, Calendar, Star, Trash2, Crown, User } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { getSupabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/utils/logger";

import heroVideo from "@/assets/hero-video.mp4";
import meetrunLogo from "@/assets/meetrun-logo.png";

type ActivityItem = {
  id: string;
  title: string;
  scheduled_at?: string | null;
  location_hint?: string | null;
  max_participants?: number | null;
  enrollments?: Array<{ count?: number }>;
  enrollment_status?: string;
  activity_type: "created" | "joined";
  activity_date: string; // created_at de la session/enrollment
};

const Home = () => {
  const navigate = useNavigate();
  const { user, hasActiveSubscription } = useAuth();
  const { toast } = useToast();
  const supabase = getSupabase();

  const [userActivity, setUserActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);

  // -------- Fetch activité utilisateur --------
  const fetchUserActivity = useCallback(async (userId: string) => {
    if (!supabase || !userId) return;

    setLoading(true);
    try {
      logger.info("[Home] Fetching user activity for user:", userId);

      // Sessions créées (inclut count via relation)
      const { data: createdSessions, error: sessionsError } = await supabase
        .from("sessions")
        .select(`
          id, title, scheduled_at, created_at, location_hint, max_participants,
          enrollments:enrollments(count)
        `)
        .eq("host_id", userId)
        .order("scheduled_at", { ascending: false })
        .limit(3);

      if (sessionsError) throw sessionsError;

      // Sessions rejointes (on garde sessions(*) pour compat TS/relations)
      const { data: enrolledSessions, error: enrollmentsError } = await supabase
        .from("enrollments")
        .select(`
          created_at, status,
          sessions(*)
        `)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(3);

      if (enrollmentsError) throw enrollmentsError;

      const activities: ActivityItem[] = [];

      if (createdSessions?.length) {
        activities.push(
          ...createdSessions.map((s: any) => ({
            id: s.id as string,
            title: s.title as string,
            scheduled_at: s.scheduled_at ?? null,
            location_hint: s.location_hint ?? null,
            max_participants: s.max_participants ?? null,
            enrollments: s.enrollments ?? [],
            activity_type: "created" as const,
            activity_date: s.created_at as string,
          }))
        );
      }

      if (enrolledSessions?.length) {
        activities.push(
          ...enrolledSessions.map((e: any) => ({
            id: e.sessions?.id as string,
            title: e.sessions?.title as string,
            scheduled_at: e.sessions?.scheduled_at ?? null,
            location_hint: e.sessions?.location_hint ?? null,
            enrollment_status: e.status as string,
            activity_type: "joined" as const,
            activity_date: e.created_at as string,
          }))
        );
      }

      activities.sort(
        (a, b) =>
          new Date(b.activity_date).getTime() - new Date(a.activity_date).getTime()
      );

      const top5 = activities.slice(0, 5);
      setUserActivity(top5);
      logger.info("[Home] Final activities:", top5);
    } catch (error: any) {
      console.error("[Home] Error loading activities:", error);
      logger.error("[Home] Error loading activities:", error);
      toast({
        title: "Erreur",
        description: "Impossible de charger votre activité récente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [supabase, toast]);

  // Effet principal : charger activité si user présent
  useEffect(() => {
    if (user?.id) {
      fetchUserActivity(user.id);
    }
  }, [user?.id, fetchUserActivity]);

  // Écouter un éventuel événement custom pour rafraîchir (avec debounce)
  useEffect(() => {
    if (!user?.id) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    const handleProfileRefresh = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (user?.id) fetchUserActivity(user.id);
      }, 2000);
    };

    window.addEventListener("profileRefresh", handleProfileRefresh);
    return () => {
      window.removeEventListener("profileRefresh", handleProfileRefresh);
      clearTimeout(timeoutId);
    };
  }, [user?.id, fetchUserActivity]);

  // -------- Suppression session (sécurisée côté client) --------
  const handleDeleteSession = async (sessionId: string) => {
    if (!user || !supabase) return;

    if (!confirm("Êtes-vous sûr de vouloir supprimer cette session ? Cette action est irréversible.")) {
      return;
    }

    setDeletingSessionId(sessionId);
    try {
      const { error } = await supabase
        .from("sessions")
        .delete()
        .eq("id", sessionId)
        .eq("host_id", user.id); // garde côté client (RLS recommandé côté DB aussi)

      if (error) throw error;

      toast({
        title: "Session supprimée",
        description: "La session a été supprimée avec succès.",
      });

      if (user.id) {
        fetchUserActivity(user.id);
      }
    } catch (error: any) {
      toast({
        title: "Erreur de suppression",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeletingSessionId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-border px-4 py-3">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <img
            src={meetrunLogo}
            alt="MeetRun"
            className="h-8 cursor-pointer"
            onClick={() => navigate("/")}
          />
          <div className="flex items-center gap-2">
            {user ? (
              <Button variant="ghost" size="sm" onClick={() => navigate("/profile")} className="p-2">
                <User size={20} />
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  onClick={() => navigate("/auth?returnTo=/")}
                  className="text-primary font-semibold"
                >
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

      {/* Main content avec padding pour le header fixe */}
      <div className="pt-16">
        {/* Hero Section */}
        <div className="relative h-[50vh] overflow-hidden">
          <video
            src={heroVideo}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/55 to-black/35" />
          <div className="absolute inset-0 flex flex-col justify-center items-center text-white p-6">
            <h1 className="text-4xl font-bold mb-2 text-center">MeetRun</h1>
            <p className="text-lg font-bold opacity-95 mb-6 text-center">Marche. Cours. Rencontre.</p>
            <div className="flex flex-col sm:flex-row gap-4">
              {user ? (
                <>
                  <Button
                    variant="sport"
                    size="lg"
                    onClick={() => navigate("/map")}
                    className="font-semibold px-8 py-4 rounded-xl shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-300 bg-gradient-to-r from-primary to-primary-variant border-2 border-white/20 backdrop-blur-sm"
                  >
                    Voir les sessions
                  </Button>
                  <Button
                    variant="sport"
                    size="lg"
                    onClick={() => navigate("/create")}
                    className="font-semibold px-8 py-4 rounded-xl shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-300 bg-gradient-to-r from-primary to-primary-variant border-2 border-white/20 backdrop-blur-sm"
                  >
                    Créer une session
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="sport"
                    size="lg"
                    onClick={() => navigate("/map")}
                    className="font-semibold px-8 py-4 rounded-xl shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-300 bg-gradient-to-r from-primary to-primary-variant border-2 border-white/20 backdrop-blur-sm"
                  >
                    Voir les sessions
                  </Button>
                  <Button
                    variant="sport"
                    size="lg"
                    onClick={() => {
                      if (!user) {
                        navigate("/auth?returnTo=/create");
                      } else {
                        navigate("/create");
                      }
                    }}
                    className="font-semibold px-8 py-4 rounded-xl shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-300 bg-gradient-to-r from-primary to-primary-variant border-2 border-white/20 backdrop-blur-sm"
                  >
                    Créer une session
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* How it works section */}
        <div className="p-6">
          <h2 className="text-2xl font-bold text-center mb-8 text-foreground">
            Comment ça marche ?
          </h2>

          <div className="space-y-6 mb-8">
            <Card className="shadow-card">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-20 h-8 sm:w-8 sm:h-8 rounded-full gradient-primary flex items-center justify-center text-white font-bold text-lg sm:text-sm shadow-lg">
                    1
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-2">Trouve ta course avec d'autres runners</h3>
                    <p className="text-muted-foreground">Découvre les sessions de running collectif près de chez toi sur la carte interactive.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-20 h-8 sm:w-8 sm:h-8 rounded-full gradient-primary flex items-center justify-center text-white font-bold text-lg sm:text-sm shadow-lg">
                    2
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-2">Abonne-toi</h3>
                    <p className="text-muted-foreground">Abonne-toi pour 9,99€/mois et accède à toutes les sessions de running collectif en illimité.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-20 h-8 sm:w-8 sm:h-8 rounded-full gradient-primary flex items-center justify-center text-white font-bold text-lg sm:text-sm shadow-lg">
                    3
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-2">Run et fais des rencontres inoubliables</h3>
                    <p className="text-muted-foreground">Rejoins ton groupe au point de rendez-vous et profite de ton run collectif !</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Button
              variant="sportSecondary"
              size="lg"
              className="font-semibold shadow-lg hover:shadow-xl transition-all duration-300"
              onClick={() => navigate("/map")}
            >
              Voir toutes les sessions
            </Button>
            <Button
              variant="sport"
              size="lg"
              className="font-semibold shadow-lg hover:shadow-xl transition-all duration-300"
              onClick={() => navigate("/subscription")}
            >
              <Crown size={16} className="mr-2" />
              S'abonner maintenant
            </Button>
          </div>
        </div>

        {/* CTA Abonnement visible pour TOUS les utilisateurs */}
        {!hasActiveSubscription && (
          <div className="p-6">
            <Card className="shadow-card border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10">
              <CardContent className="p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Crown size={20} className="text-primary" />
                      <h3 className="font-bold text-lg whitespace-nowrap">MeetRun Unlimited</h3>
                    </div>
                    <p className="text-muted-foreground mb-3 text-sm sm:text-base">
                      Accès illimité aux sessions • Lieux exacts • Aucun paiement à la course
                    </p>
                    <div className="text-2xl font-bold text-primary whitespace-nowrap">9,99 €/mois</div>
                  </div>
                  <Button
                    variant="sport"
                    size="lg"
                    onClick={() => navigate("/subscription")}
                    className="w-full sm:w-auto sm:ml-4"
                  >
                    {user ? "S'abonner" : "Découvrir"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Activity Section */}
        {user && (
          <div className="p-6 pt-0">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Star size={20} />
                  Mon activité récente
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="animate-pulse">
                        <div className="h-16 bg-gray-200 rounded-lg" />
                      </div>
                    ))}
                  </div>
                ) : userActivity.length > 0 ? (
                  <div className="space-y-4">
                    {userActivity.map((activity, index) => (
                      <div key={`${activity.id}-${index}`} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                        <div
                          className={`w-2 h-2 rounded-full mt-2 ${
                            activity.activity_type === "created"
                              ? "bg-primary"
                              : activity.enrollment_status === "paid" ||
                                activity.enrollment_status === "included_by_subscription"
                              ? "bg-green-500"
                              : "bg-blue-500"
                          }`}
                        />
                        <div className="flex-1">
                          <div className="flex justify-between items-start mb-1">
                            <h4 className="font-medium">{activity.title}</h4>
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={
                                  activity.activity_type === "created"
                                    ? "default"
                                    : activity.enrollment_status === "paid" ||
                                      activity.enrollment_status === "included_by_subscription"
                                    ? "secondary"
                                    : "outline"
                                }
                                className="text-xs"
                              >
                                {activity.activity_type === "created"
                                  ? "Organisée"
                                  : activity.enrollment_status === "paid" ||
                                    activity.enrollment_status === "included_by_subscription"
                                  ? "Participé"
                                  : "Inscrite"}
                              </Badge>
                              {activity.activity_type === "created" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteSession(activity.id);
                                  }}
                                  disabled={deletingSessionId === activity.id}
                                  className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  title="Supprimer la session"
                                >
                                  <Trash2 size={12} />
                                </Button>
                              )}
                            </div>
                          </div>

                          <p className="text-sm text-muted-foreground flex items-center gap-1 mb-1">
                            <Calendar size={12} />
                            {(() => {
                              const d = activity.scheduled_at ?? activity.activity_date;
                              try {
                                return new Date(d).toLocaleDateString("fr-FR", {
                                  day: "numeric",
                                  month: "long",
                                });
                              } catch {
                                return "—";
                              }
                            })()}
                          </p>

                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <MapPin size={12} />
                            {activity.location_hint || "Localisation masquée"}
                            {activity.activity_type === "created" && activity.enrollments && (
                              <span className="ml-2 flex items-center gap-1">
                                <Users size={12} />
                                {(activity.enrollments[0]?.count || 0)}/{activity.max_participants ?? 0}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    ))}
                    <Button
                      variant="ghost"
                      className="w-full mt-2"
                      onClick={() => navigate("/profile")}
                    >
                      Voir tout l'historique
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Star size={48} className="mx-auto mb-4 opacity-50" />
                    <p>Aucune activité récente</p>
                    <p className="text-sm">Rejoignez ou créez votre première course !</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;
