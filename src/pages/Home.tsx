import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Users, Calendar, Star, Trash2, Crown } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getSupabase } from "@/integrations/supabase/client";
import heroImage from "@/assets/hero-background.jpg";
import logoImage from "@/assets/meetrun-logo.png";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/utils/logger";

type ActivityCreated = {
  id: string;
  title: string;
  created_at: string;
  scheduled_at: string | null;
  location_hint?: string | null;
  max_participants?: number | null;
  enrollments?: { count: number }[];
  activity_type: "created";
  activity_date: string;
};

type ActivityJoined = {
  id: string;
  title: string;
  created_at: string;
  scheduled_at: string | null;
  location_hint?: string | null;
  max_participants?: number | null;
  enrollment_status: string;
  activity_type: "joined";
  activity_date: string;
};

type Activity = ActivityCreated | ActivityJoined;

const Home = () => {
  const navigate = useNavigate();
  const { user, signOut, hasActiveSubscription } = useAuth();
  const { toast } = useToast();
  const [userActivity, setUserActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);

  const supabase = getSupabase();

  // Refs de sécurité
  const mountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch activité (avec await partout)
  const fetchUserActivity = useCallback(
    async (userId: string) => {
      if (!supabase || !userId || !mountedRef.current) return;

      // Annuler la requête précédente
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      setLoading(true);
      try {
        // sessions créées
        const { data: createdSessions, error: sessionsError } = await supabase
          .from("sessions")
          .select(
            `
            *,
            enrollments(count)
          `
          )
          .eq("host_id", userId)
          .order("scheduled_at", { ascending: false })
          .limit(3);

        if (sessionsError) throw sessionsError;
        if (signal.aborted || !mountedRef.current) return;

        // sessions rejointes
        const { data: enrolledSessions, error: enrollmentsError } = await supabase
          .from("enrollments")
          .select(
            `
            *,
            sessions(*)
          `
          )
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(3);

        if (enrollmentsError) throw enrollmentsError;
        if (signal.aborted || !mountedRef.current) return;

        const activities: Activity[] = [];

        if (createdSessions) {
          activities.push(
            ...createdSessions.map((session: any) => ({
              ...session,
              activity_type: "created" as const,
              activity_date: session.created_at as string,
            }))
          );
        }

        if (enrolledSessions) {
          activities.push(
            ...enrolledSessions.map((enrollment: any) => ({
              ...(enrollment.sessions || {}),
              enrollment_status: enrollment.status,
              activity_type: "joined" as const,
              activity_date: enrollment.created_at as string,
            }))
          );
        }

        activities.sort(
          (a, b) =>
            new Date(b.activity_date).getTime() - new Date(a.activity_date).getTime()
        );

        if (!signal.aborted && mountedRef.current) {
          setUserActivity(activities.slice(0, 5));
        }
      } catch (error: any) {
        if (error?.name === "AbortError") {
          // no-op
        } else {
          logger.error("[Home] Error loading activities:", error);
        }
      } finally {
        if (!signal.aborted && mountedRef.current) {
          setLoading(false);
        }
      }
    },
    [supabase]
  );

  // Charger activité quand user change
  useEffect(() => {
    if (user?.id && mountedRef.current) {
      fetchUserActivity(user.id);
    }
  }, [user?.id, fetchUserActivity]);

  // Debounce refresh
  const debouncedRefresh = useCallback(() => {
    if (!user?.id || !mountedRef.current) return;
    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
    debounceTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current && user?.id) {
        fetchUserActivity(user.id);
      }
    }, 2000);
  }, [user?.id, fetchUserActivity]);

  // Écouteur custom-event
  useEffect(() => {
    if (!user?.id) return;
    const handleProfileRefresh = () => {
      if (mountedRef.current) debouncedRefresh();
    };
    window.addEventListener("profileRefresh", handleProfileRefresh);
    return () => {
      window.removeEventListener("profileRefresh", handleProfileRefresh);
    };
  }, [debouncedRefresh, user?.id]);

  // Cleanup général
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  // Suppression session
  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      if (!user || !mountedRef.current || !supabase) return;

      if (!confirm("Êtes-vous sûr de vouloir supprimer cette session ?")) return;

      setDeletingSessionId(sessionId);
      try {
        const { error } = await supabase.from("sessions").delete().eq("id", sessionId);
        if (error) throw error;

        if (mountedRef.current) {
          toast({
            title: "Session supprimée",
            description: "La session a été supprimée avec succès.",
          });
          await fetchUserActivity(user.id);
        }
      } catch (error: any) {
        if (mountedRef.current) {
          toast({
            title: "Erreur de suppression",
            description: error.message || "Une erreur est survenue.",
            variant: "destructive",
          });
        }
      } finally {
        if (mountedRef.current) setDeletingSessionId(null);
      }
    },
    [supabase, toast, user, fetchUserActivity]
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-white border-b border-border px-4 py-3">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <img src={logoImage} alt="MeetRun Logo" className="h-8 w-auto" />
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <Button variant="ghost" onClick={() => navigate("/profile")}>
                  Profil
                </Button>
                <Button variant="ghost" onClick={signOut}>
                  Déconnexion
                </Button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  onClick={() => navigate("/auth?returnTo=/")}
                  className="text-primary font-semibold"
                >
                  Se connecter
                </Button>
                <Button
                  variant="sport"
                  onClick={() => navigate("/auth?mode=signup&returnTo=/")}
                >
                  S'inscrire
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main */}
      <div className="main-content">
        {/* Hero */}
        <div className="relative h-[50vh] overflow-hidden">
          <img
            src={heroImage}
            alt="MeetRun - Marche, cours, rencontre"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/55 to-black/35" />
          <div className="absolute inset-0 flex flex-col justify-center items-center text-white p-6">
            <h1 className="text-4xl font-bold mb-2 text-center">MeetRun</h1>
            <p className="text-lg font-bold opacity-95 mb-6 text-center">
              Marche. Cours. Rencontre.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              {user ? (
                <>
                  <Button
                    variant="sport"
                    size="lg"
                    onClick={() => navigate("/map")}
                    className="font-semibold px-8 py-4 rounded-xl shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-300 bg-gradient-to-r from-primary to-primary-variant border-2 border-white/20 backdrop-blur-sm"
                  >
                    Voir les courses
                  </Button>
                  <Button
                    variant="sport"
                    size="lg"
                    onClick={() => navigate("/create")}
                    className="font-semibold px-8 py-4 rounded-xl shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-300 bg-gradient-to-r from-primary to-primary-variant border-2 border-white/20 backdrop-blur-sm"
                  >
                    Créer une course
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
                    Voir les courses
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
                    Créer une course
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* How it works */}
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
                    <h3 className="font-semibold text-foreground mb-2">
                      Trouve ta course avec d'autres runners
                    </h3>
                    <p className="text-muted-foreground">
                      Découvre les sessions de running collectif près de chez toi
                      sur la carte interactive.
                    </p>
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
                    <p className="text-muted-foreground">
                      Abonne-toi pour 9,99€/mois et accède à toutes les sessions
                      de running collectif en illimité.
                    </p>
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
                    <h3 className="font-semibold text-foreground mb-2">
                      Run et fais des rencontres inoubliables
                    </h3>
                    <p className="text-muted-foreground">
                      Rejoins ton groupe au point de rendez-vous et profite de ton
                      run collectif !
                    </p>
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
              Voir toutes les courses
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

        {/* CTA abonnement */}
        {!hasActiveSubscription && (
          <div className="p-6">
            <Card className="shadow-card border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10">
              <CardContent className="p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Crown size={20} className="text-primary" />
                      <h3 className="font-bold text-lg whitespace-nowrap">
                        MeetRun Unlimited
                      </h3>
                    </div>
                    <p className="text-muted-foreground mb-3 text-sm sm:text-base">
                      Accès illimité aux sessions • Lieux exacts • Aucun paiement à la
                      course
                    </p>
                    <div className="text-2xl font-bold text-primary whitespace-nowrap">
                      9,99 €/mois
                    </div>
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

        {/* Activité */}
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
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="animate-pulse">
                        <div className="h-16 bg-gray-200 rounded-lg"></div>
                      </div>
                    ))}
                  </div>
                ) : userActivity.length > 0 ? (
                  <div className="space-y-4">
                    {userActivity.map((activity, index) => (
                      <div
                        key={`${activity.id}-${index}`}
                        className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
                      >
                        <div
                          className={`w-2 h-2 rounded-full mt-2 ${
                            activity.activity_type === "created"
                              ? "bg-primary"
                              : (activity as any).enrollment_status === "paid" ||
                                (activity as any).enrollment_status ===
                                  "included_by_subscription"
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
                                    : (activity as any).enrollment_status === "paid" ||
                                      (activity as any).enrollment_status ===
                                        "included_by_subscription"
                                    ? "secondary"
                                    : "outline"
                                }
                                className="text-xs"
                              >
                                {activity.activity_type === "created"
                                  ? "Organisée"
                                  : (activity as any).enrollment_status === "paid" ||
                                    (activity as any).enrollment_status ===
                                      "included_by_subscription"
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
                                >
                                  <Trash2 size={12} />
                                </Button>
                              )}
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground flex items-center gap-1 mb-1">
                            <Calendar size={12} />
                            {new Date(
                              (activity as any).scheduled_at || (activity as any).date
                            ).toLocaleDateString("fr-FR", {
                              day: "numeric",
                              month: "long",
                            })}
                          </p>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <MapPin size={12} />
                            {(activity as any).location_hint || "Localisation masquée"}
                            {activity.activity_type === "created" &&
                              (activity as any).enrollments && (
                                <span className="ml-2 flex items-center gap-1">
                                  <Users size={12} />
                                  {(activity as any).enrollments?.[0]?.count || 0}/
                                  {(activity as any).max_participants || 0}
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
                    <p className="text-sm">
                      Rejoignez ou créez votre première course !
                    </p>
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
