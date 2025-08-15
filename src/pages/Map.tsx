// src/pages/Map.tsx - Corrections des problèmes de carte

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Header from "@/components/Header";
import LeafletMeetRunMap from "@/components/LeafletMeetRunMap";
import { Filter, MapPin, Users, Clock, X } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useSearchParams } from "react-router-dom";

const Map = () => {
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [filteredSessions, setFilteredSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const { user, hasActiveSubscription } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const realtimeChannelRef = useRef<any>(null);
  
  useEffect(() => {
    fetchSessions();
  }, [user]);

  useEffect(() => {
    // Vérifier si une session spécifique doit être mise en évidence
    const sessionId = searchParams.get('sessionId');
    if (sessionId && sessions.length > 0) {
      const session = sessions.find(s => s.id === sessionId);
      if (session) {
        setSelectedSession(session);
      }
    }
  }, [searchParams, sessions]);

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

  // Appliquer les filtres quand les sessions ou filtres changent
  useEffect(() => {
    applyFilters();
  }, [sessions, activeFilters]);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log("[sessions] Récupération des sessions...");

      // CORRECTION: Requête simplifiée et validation des coordonnées
      const { data, error } = await supabase
        .from("sessions")
        .select(`
          *,
          host_profile:profiles!host_id(id, full_name, avatar_url),
          enrollments(id, user_id, status)
        `)
        .gte('date', new Date().toISOString())
        .order('date', { ascending: true });

      if (error) {
        throw new Error(`Erreur récupération sessions: ${error.message}`);
      }

      // CORRECTION: Validation stricte des coordonnées
      const validSessions = (data || []).filter(session => {
        const lat = Number(session.start_lat);
        const lng = Number(session.start_lng);
        
        const isValidLat = Number.isFinite(lat) && lat >= -90 && lat <= 90;
        const isValidLng = Number.isFinite(lng) && lng >= -180 && lng <= 180;
        
        if (!isValidLat || !isValidLng) {
          console.warn(`Session ${session.id} a des coordonnées invalides:`, { lat, lng });
          return false;
        }
        
        return true;
      });

      console.log(`[sessions] ${validSessions.length} sessions valides récupérées sur ${data?.length || 0}`);
      setSessions(validSessions);

    } catch (error: any) {
      console.error("[sessions] Erreur:", error);
      setError(error.message);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    if (activeFilters.length === 0) {
      setFilteredSessions(sessions);
      return;
    }

    const filtered = sessions.filter(session => {
      return activeFilters.every(filter => {
        switch (filter) {
          case '5km':
            return Number(session.distance_km) === 5;
          case '10km':
            return Number(session.distance_km) === 10;
          case '15km':
            return Number(session.distance_km) === 15;
          case 'mixte':
            return session.type === 'mixed';
          case 'faible':
            return session.intensity === 'low';
          case 'moyenne':
            return session.intensity === 'medium';
          case 'elevee':
            return session.intensity === 'high';
          default:
            return true;
        }
      });
    });

    setFilteredSessions(filtered);
  };

  const toggleFilter = (filter: string) => {
    setActiveFilters(prev => {
      if (prev.includes(filter)) {
        return prev.filter(f => f !== filter);
      } else {
        return [...prev, filter];
      }
    });
  };

  const clearAllFilters = () => {
    setActiveFilters([]);
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

  // Obtenir le nombre de sessions par filtre
  const getFilterCount = (filter: string) => {
    switch (filter) {
      case '5km':
        return sessions.filter(s => Number(s.distance_km) === 5).length;
      case '10km':
        return sessions.filter(s => Number(s.distance_km) === 10).length;
      case '15km':
        return sessions.filter(s => Number(s.distance_km) === 15).length;
      case 'mixte':
        return sessions.filter(s => s.type === 'mixed').length;
      case 'faible':
        return sessions.filter(s => s.intensity === 'low').length;
      case 'moyenne':
        return sessions.filter(s => s.intensity === 'medium').length;
      case 'elevee':
        return sessions.filter(s => s.intensity === 'high').length;
      default:
        return 0;
    }
  };

  if (loading) {
    return (
      <div className="h-screen bg-background flex flex-col">
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
      <div className="h-screen bg-background flex flex-col">
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
    <div className="h-screen bg-background flex flex-col">
      <Header 
        title={`Carte (${filteredSessions.length})`}
        actions={
          <div className="flex items-center gap-2">
            {activeFilters.length > 0 && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={clearAllFilters}
                className="text-xs"
              >
                <X size={14} className="mr-1" />
                Effacer
              </Button>
            )}
            <Button variant="ghost" size="icon">
              <Filter size={20} />
            </Button>
          </div>
        }
      />
      
      {/* CORRECTION: Map container avec padding-bottom pour éviter l'overlap avec la navigation */}
      <div className="flex-1 relative pb-20">
        {sessions.length === 0 && !loading ? (
          // Empty state - no sessions at all
          <div className="absolute inset-0 flex items-center justify-center p-8">
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
        ) : (
          <>
            {/* CORRECTION: Données correctement formatées pour la carte */}
            <LeafletMeetRunMap 
              sessions={filteredSessions.map(session => ({
                id: session.id,
                title: session.title,
                date: session.date,
                // CORRECTION: Utiliser start_lat/start_lng depuis la base de données
                location_lat: Number(session.start_lat),
                location_lng: Number(session.start_lng),
                end_lat: session.end_lat ? Number(session.end_lat) : null,
                end_lng: session.end_lng ? Number(session.end_lng) : null,
                blur_radius_m: session.blur_radius_m || 1000,
                area_hint: session.area_hint,
                max_participants: session.max_participants,
                price_cents: session.price_cents || 0,
                distance_km: Number(session.distance_km),
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
              isLoading={loading}
            />

            {/* Floating Filter Bar - CORRECTION: Ajusté pour éviter l'overlap avec la navigation */}
            {sessions.length > 0 && (
              <div className="absolute bottom-20 left-4 right-4 z-[1000]">
                <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200/50 p-3">
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    <Button 
                      variant={activeFilters.length === 0 ? "sport" : "sportSecondary"} 
                      size="sm"
                      onClick={clearAllFilters}
                      className="whitespace-nowrap"
                    >
                      Toutes ({sessions.length})
                    </Button>
                    
                    {/* Filtres de distance */}
                    <Button 
                      variant={activeFilters.includes('5km') ? "sport" : "sportSecondary"} 
                      size="sm"
                      onClick={() => toggleFilter('5km')}
                      className="whitespace-nowrap"
                    >
                      5km ({getFilterCount('5km')})
                    </Button>
                    <Button 
                      variant={activeFilters.includes('10km') ? "sport" : "sportSecondary"} 
                      size="sm"
                      onClick={() => toggleFilter('10km')}
                      className="whitespace-nowrap"
                    >
                      10km ({getFilterCount('10km')})
                    </Button>
                    <Button 
                      variant={activeFilters.includes('15km') ? "sport" : "sportSecondary"} 
                      size="sm"
                      onClick={() => toggleFilter('15km')}
                      className="whitespace-nowrap"
                    >
                      15km ({getFilterCount('15km')})
                    </Button>
                    
                    {/* Filtre de type */}
                    <Button 
                      variant={activeFilters.includes('mixte') ? "sport" : "sportSecondary"} 
                      size="sm"
                      onClick={() => toggleFilter('mixte')}
                      className="whitespace-nowrap"
                    >
                      Mixte ({getFilterCount('mixte')})
                    </Button>
                    
                    {/* Filtres d'intensité */}
                    <Button 
                      variant={activeFilters.includes('faible') ? "sport" : "sportSecondary"} 
                      size="sm"
                      onClick={() => toggleFilter('faible')}
                      className="whitespace-nowrap"
                    >
                      Faible ({getFilterCount('faible')})
                    </Button>
                    <Button 
                      variant={activeFilters.includes('moyenne') ? "sport" : "sportSecondary"} 
                      size="sm"
                      onClick={() => toggleFilter('moyenne')}
                      className="whitespace-nowrap"
                    >
                      Moyenne ({getFilterCount('moyenne')})
                    </Button>
                    <Button 
                      variant={activeFilters.includes('elevee') ? "sport" : "sportSecondary"} 
                      size="sm"
                      onClick={() => toggleFilter('elevee')}
                      className="whitespace-nowrap"
                    >
                      Élevée ({getFilterCount('elevee')})
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Selected session details - Floating card */}
            {selectedSession && (
              <div className="absolute top-4 left-4 right-4 z-[1000]">
                <Card className="shadow-lg bg-white/95 backdrop-blur-sm border-gray-200/50">
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
                        className="text-gray-500 hover:text-gray-700"
                      >
                        <X size={16} />
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

            {/* Empty state pour filtres */}
            {filteredSessions.length === 0 && sessions.length > 0 && (
              <div className="absolute inset-0 flex items-center justify-center p-8 bg-white/80 backdrop-blur-sm">
                <div className="text-center">
                  <Filter size={48} className="mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">Aucune session trouvée</h3>
                  <p className="text-muted-foreground mb-4">
                    Aucune session ne correspond aux filtres sélectionnés.
                  </p>
                  <Button 
                    variant="sport" 
                    onClick={clearAllFilters}
                  >
                    Voir toutes les sessions
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Map;