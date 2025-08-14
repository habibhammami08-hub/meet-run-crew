import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Header from "@/components/Header";
import LeafletMeetRunMap from "@/components/LeafletMeetRunMap";
import { Filter, MapPin, Users, Clock } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabaseClient";
import { useNavigate, useSearchParams } from "react-router-dom";

const Map = () => {
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, hasActiveSubscription } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const realtimeChannelRef = useRef<any>(null);
  
  useEffect(() => {
    fetchSessions();
    
    // Vérifier si une session spécifique doit être mise en évidence
    const sessionId = searchParams.get('sessionId');
    if (sessionId && sessions.length > 0) {
      const session = sessions.find(s => s.id === sessionId);
      if (session) {
        setSelectedSession(session);
      }
    }
  }, [user, searchParams, sessions.length]);

  useEffect(() => {
    // Configuration Realtime pour les sessions
    if (realtimeChannelRef.current) {
      realtimeChannelRef.current.unsubscribe();
    }

    realtimeChannelRef.current = supabase
      .channel("public:sessions")
      .on("postgres_changes", { 
        event: "INSERT", 
        schema: "public", 
        table: "sessions" 
      }, (payload) => {
        console.log("[realtime] Nouvelle session:", payload.new);
        setSessions(prev => [payload.new as any, ...prev]);
      })
      .on("postgres_changes", { 
        event: "UPDATE", 
        schema: "public", 
        table: "sessions" 
      }, (payload) => {
        console.log("[realtime] Session mise à jour:", payload.new);
        setSessions(prev => prev.map(s => 
          s.id === payload.new.id ? { ...s, ...payload.new } : s
        ));
      })
      .on("postgres_changes", { 
        event: "DELETE", 
        schema: "public", 
        table: "sessions" 
      }, (payload) => {
        console.log("[realtime] Session supprimée:", payload.old);
        setSessions(prev => prev.filter(s => s.id !== payload.old.id));
        if (selectedSession?.id === payload.old.id) {
          setSelectedSession(null);
        }
      })
      .subscribe((status) => {
        console.log("🛰️ Realtime sessions:", status);
      });

    return () => {
      if (realtimeChannelRef.current) {
        realtimeChannelRef.current.unsubscribe();
        realtimeChannelRef.current = null;
      }
    };
  }, [selectedSession?.id]);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      setError(null);

      // Tentative avec jointure pour récupérer les profils des hôtes
      let { data, error } = await supabase
        .from("sessions")
        .select(`
          *,
          host_profile:profiles!host_id(id, full_name, avatar_url),
          enrollments(id, user_id, status)
        `)
        .gte('date', new Date().toISOString())
        .order('date', { ascending: true });

      // Fallback sans jointure si la première requête échoue
      if (error || !data) {
        console.warn("[sessions] Jointure échouée, fallback sans profils:", error);
        
        const { data: fallbackData, error: fallbackError } = await supabase
          .from("sessions")
          .select("*")
          .gte('date', new Date().toISOString())
          .order('date', { ascending: true });
        
        if (fallbackError) {
          throw new Error(`Erreur récupération sessions: ${fallbackError.message}`);
        }
        
        data = fallbackData || [];
        
        // Récupérer les profils séparément si nécessaire
        if (data.length > 0) {
          const hostIds = [...new Set(data.map(s => s.host_id))];
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name, avatar_url')
            .in('id', hostIds);

          // Associer les profils aux sessions
          data = data.map(session => ({
            ...session,
            host_profile: profiles?.find(p => p.id === session.host_id) || null
          }));
        }
      }

      console.log(`[sessions] ${data.length} sessions récupérées`);
      setSessions(data || []);

    } catch (error: any) {
      console.error("[sessions] Erreur:", error);
      setError(error.message);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };

  // Vérifier si l'utilisateur est inscrit à une session
  const isUserEnrolled = (session: any) => {
    if (!user || !session.enrollments) return false;
    return session.enrollments.some((e: any) => 
      e.user_id === user.id && 
      (e.status === 'paid' || e.status === 'included_by_subscription')
    );
  };

  // Vérifier si l'utilisateur est l'hôte
  const isUserHost = (session: any) => {
    return user && session.host_id === user.id;
  };

  // Obtenir le nombre de participants payés
  const getParticipantCount = (session: any) => {
    if (!session.enrollments) return 0;
    return session.enrollments.filter((e: any) => 
      e.status === 'paid' || e.status === 'included_by_subscription'
    ).length;
  };

  // Formater la date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header title="Carte des sessions" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Chargement des sessions...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header title="Carte des sessions" />
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="shadow-card max-w-md">
            <CardContent className="p-6 text-center">
              <p className="text-destructive mb-4">Erreur de chargement</p>
              <p className="text-sm text-muted-foreground mb-4">{error}</p>
              <Button onClick={fetchSessions} variant="outline">
                Réessayer
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header 
        title={`Carte des sessions (${sessions.length})`}
        actions={
          <Button variant="ghost" size="icon">
            <Filter size={20} />
          </Button>
        }
      />
      
      {/* Interactive Map */}
      <div className="flex-1">
        <LeafletMeetRunMap 
          sessions={sessions.map(session => ({
            id: session.id,
            title: session.title,
            date: session.date,
            location_lat: parseFloat(session.location_lat.toString()),
            location_lng: parseFloat(session.location_lng.toString()),
            end_lat: session.end_lat ? parseFloat(session.end_lat.toString()) : null,
            end_lng: session.end_lng ? parseFloat(session.end_lng.toString()) : null,
            blur_radius_m: session.blur_radius_m || 1000,
            area_hint: session.area_hint,
            max_participants: session.max_participants,
            price_cents: session.price_cents || 0,
            distance_km: parseFloat(session.distance_km.toString()),
            intensity: session.intensity,
            host_id: session.host_id,
            enrollments: session.enrollments || [],
            host_profile: session.host_profile
          }))}
          onSessionSelect={(sessionId) => {
            const session = sessions.find(s => s.id === sessionId);
            if (session) {
              setSelectedSession(session);
            } else {
              // Naviguer vers les détails de la session
              navigate(`/session/${sessionId}`);
            }
          }}
          className="h-full"
        />
      </div>

      {/* Filter bar */}
      {sessions.length > 0 && (
        <div className="p-4 bg-white border-t border-border">
          <div className="flex gap-2 overflow-x-auto">
            <Button variant="sport" size="sm">Toutes ({sessions.length})</Button>
            <Button variant="sportSecondary" size="sm">
              5km ({sessions.filter(s => s.distance_km === 5).length})
            </Button>
            <Button variant="sportSecondary" size="sm">
              10km ({sessions.filter(s => s.distance_km === 10).length})
            </Button>
            <Button variant="sportSecondary" size="sm">
              Mixte ({sessions.filter(s => s.type === 'mixed').length})
            </Button>
            <Button variant="sportSecondary" size="sm">
              Faible ({sessions.filter(s => s.intensity === 'low').length})
            </Button>
            <Button variant="sportSecondary" size="sm">
              Moyenne ({sessions.filter(s => s.intensity === 'medium').length})
            </Button>
            <Button variant="sportSecondary" size="sm">
              Élevée ({sessions.filter(s => s.intensity === 'high').length})
            </Button>
          </div>
        </div>
      )}

      {/* Selected session details */}
      {selectedSession && (
        <div className="p-4 bg-white border-t border-border">
          <Card className="shadow-card">
            <CardContent className="p-4">
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <h4 className="font-semibold text-sport-black">{selectedSession.title}</h4>
                  <p className="text-sm text-sport-gray flex items-center gap-1">
                    <MapPin size={14} />
                    {isUserEnrolled(selectedSession) || isUserHost(selectedSession) || hasActiveSubscription
                      ? selectedSession.area_hint || "Lieu exact disponible"
                      : `Zone approx. ${Math.round((selectedSession.blur_radius_m || 1000)/1000)}km`
                    }
                  </p>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setSelectedSession(null)}
                >
                  ✕
                </Button>
              </div>
              
              <div className="flex items-center gap-4 text-sm text-sport-gray mb-4">
                <span className="flex items-center gap-1">
                  <Clock size={14} />
                  {formatDate(selectedSession.date)}
                </span>
                <span className="flex items-center gap-1">
                  <Users size={14} />
                  {getParticipantCount(selectedSession) + 1}/{selectedSession.max_participants} coureurs
                </span>
                <span className={`px-2 py-1 rounded-full text-xs ${
                  selectedSession.intensity === 'low' ? 'bg-green-100 text-green-800' :
                  selectedSession.intensity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {selectedSession.intensity === 'low' ? 'Faible' :
                   selectedSession.intensity === 'medium' ? 'Moyenne' : 'Élevée'}
                </span>
              </div>
              
              <div className="flex gap-3">
                <Button 
                  variant="sportOutline" 
                  size="sm" 
                  className="flex-1"
                  onClick={() => navigate(`/session/${selectedSession.id}`)}
                >
                  Voir détails
                </Button>
                {!isUserEnrolled(selectedSession) && 
                 !isUserHost(selectedSession) && 
                 getParticipantCount(selectedSession) < selectedSession.max_participants - 1 && (
                  <Button 
                    variant="sport" 
                    size="sm" 
                    className="flex-1"
                    onClick={() => navigate(`/session/${selectedSession.id}`)}
                  >
                    {hasActiveSubscription ? "Rejoindre" : "S'abonner"}
                  </Button>
                )}
                {isUserEnrolled(selectedSession) && (
                  <Button variant="secondary" size="sm" className="flex-1" disabled>
                    ✓ Inscrit
                  </Button>
                )}
                {isUserHost(selectedSession) && (
                  <Button variant="secondary" size="sm" className="flex-1" disabled>
                    ✓ Organisateur
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Empty state */}
      {sessions.length === 0 && !loading && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <MapPin size={48} className="mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">Aucune session disponible</h3>
            <p className="text-muted-foreground mb-4">
              Soyez le premier à créer une session de running !
            </p>
            <Button 
              variant="sport" 
              onClick={() => navigate('/create')}
            >
              Créer une session
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Map;