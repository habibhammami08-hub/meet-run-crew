// src/pages/Map.tsx - Version corrigée et stabilisée

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Header from "@/components/Header";
import LeafletMeetRunMap from "@/components/LeafletMeetRunMap";
import { Filter, MapPin, Users, X } from "lucide-react";
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
  const isMountedRef = useRef(true);
  
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (isMountedRef.current) {
      fetchSessions();
    }
  }, [user]);

  useEffect(() => {
    // Vérifier si une session spécifique doit être mise en évidence
    const sessionId = searchParams.get('sessionId');
    if (sessionId && sessions.length > 0 && isMountedRef.current) {
      const session = sessions.find(s => s && s.id === sessionId);
      if (session) {
        setSelectedSession(session);
      }
    }
  }, [searchParams, sessions]);

  useEffect(() => {
    // CORRECTION: Nettoyer le channel existant avec gestion d'erreur améliorée
    if (realtimeChannelRef.current) {
      try {
        supabase.removeChannel(realtimeChannelRef.current);
      } catch (e) {
        console.warn("Erreur suppression channel:", e);
      }
      realtimeChannelRef.current = null;
    }

    if (!isMountedRef.current) return;

    const channel = supabase
      .channel(`sessions-map-${Date.now()}`) // Nom unique
      .on("postgres_changes", { 
        event: "*", 
        schema: "public", 
        table: "sessions" 
      }, (payload) => {
        if (!isMountedRef.current) return;
        
        console.log("[realtime] Update:", payload);
        const { eventType, new: newData, old: oldData } = payload as any;
        
        try {
          if (eventType === 'INSERT' && newData) {
            setSessions(prev => {
              if (!isMountedRef.current) return prev;
              // CORRECTION: Vérifier si la session n'existe pas déjà
              const exists = prev.some(s => s && s.id === newData.id);
              return exists ? prev : [newData, ...prev];
            });
          } else if (eventType === 'UPDATE' && newData) {
            setSessions(prev => {
              if (!isMountedRef.current) return prev;
              return prev.map(s => 
                s && s.id === newData.id ? { ...s, ...newData } : s
              );
            });
          } else if (eventType === 'DELETE' && oldData) {
            setSessions(prev => {
              if (!isMountedRef.current) return prev;
              return prev.filter(s => s && s.id !== oldData.id);
            });
            
            if (selectedSession?.id === oldData.id) {
              setSelectedSession(null);
            }
          }
        } catch (error) {
          console.error("Erreur traitement realtime:", error);
        }
      })
      .subscribe((status) => {
        console.log("🛰️ Realtime sessions:", status);
        if (status === 'CHANNEL_ERROR') {
          console.error("Erreur channel Realtime");
          // Retry automatique après 5s
          setTimeout(() => {
            if (isMountedRef.current) {
              fetchSessions();
            }
          }, 5000);
        }
      });

    realtimeChannelRef.current = channel;

    return () => {
      if (realtimeChannelRef.current) {
        try {
          realtimeChannelRef.current.unsubscribe();
        } catch (e) {
          console.warn("Erreur unsubscribe channel:", e);
        }
        realtimeChannelRef.current = null;
      }
    };
  }, [selectedSession?.id]);

  // Appliquer les filtres quand les sessions ou filtres changent
  useEffect(() => {
    if (isMountedRef.current) {
      applyFilters();
    }
  }, [sessions, activeFilters]);

  const fetchSessions = async () => {
    if (!isMountedRef.current) return;
    
    try {
      setLoading(true);
      setError(null);

      console.log("[sessions] Récupération des sessions...");

      // CORRECTION: Requête simplifiée avec gestion d'erreurs et timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 secondes timeout

      const { data, error } = await supabase
        .from("sessions")
        .select(`
          *,
          host_profile:profiles!host_id(id, full_name, avatar_url),
          enrollments(id, user_id, status)
        `)
        .eq('status', 'published')
        .gte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
        .abortSignal(controller.signal);

      clearTimeout(timeoutId);

      if (!isMountedRef.current) return;

      if (error) {
        throw new Error(`Erreur récupération sessions: ${error.message}`);
      }

      // CORRECTION: Validation stricte et sécurisée des coordonnées
      const validSessions = (data || []).filter(session => {
        if (!session || typeof session !== 'object') {
          console.warn("Session invalide (non-objet):", session);
          return false;
        }

        const lat = Number(session.start_lat);
        const lng = Number(session.start_lng);
        
        const isValidLat = Number.isFinite(lat) && lat >= -90 && lat <= 90;
        const isValidLng = Number.isFinite(lng) && lng >= -180 && lng <= 180;
        
        if (!isValidLat || !isValidLng) {
          console.warn(`Session ${session.id} - coordonnées invalides:`, { 
            lat, lng, 
            start_lat: session.start_lat, 
            start_lng: session.start_lng 
          });
          return false;
        }

        // CORRECTION: Validation des champs obligatoires
        if (!session.id || !session.title || !session.scheduled_at) {
          console.warn(`Session ${session.id} - champs obligatoires manquants`);
          return false;
        }
        
        return true;
      });

      console.log(`[sessions] ${validSessions.length} sessions valides récupérées sur ${data?.length || 0}`);
      
      if (isMountedRef.current) {
        setSessions(validSessions);
      }

    } catch (error: any) {
      console.error("[sessions] Erreur:", error);
      if (isMountedRef.current) {
        if (error.name === 'AbortError') {
          setError("Délai de chargement dépassé. Veuillez réessayer.");
        } else {
          setError(error.message);
        }
        setSessions([]);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const applyFilters = () => {
    if (!isMountedRef.current) return;

    if (activeFilters.length === 0) {
      setFilteredSessions(sessions);
      return;
    }

    const filtered = sessions.filter(session => {
      if (!session) return false;
      
      return activeFilters.every(filter => {
        try {
          switch (filter) {
            case '1km':
              return Number(session.distance_km) === 1;
            case '3km':
              return Number(session.distance_km) === 3;
            case '5km':
              return Number(session.distance_km) === 5;
            case '10km':
              return Number(session.distance_km) === 10;
            case '15km':
              return Number(session.distance_km) === 15;
            case 'mixte':
              return session.session_type === 'mixed';
            case 'women_only':
              return session.session_type === 'women_only';
            case 'men_only':
              return session.session_type === 'men_only';
            case 'faible':
              return session.intensity === 'low';
            case 'moyenne':
              return session.intensity === 'medium';
            case 'elevee':
              return session.intensity === 'high';
            default:
              return true;
          }
        } catch (error) {
          console.error("Erreur application filtre:", error);
          return true;
        }
      });
    });

    setFilteredSessions(filtered);
  };

  const toggleFilter = (filter: string) => {
    if (!isMountedRef.current) return;
    
    setActiveFilters(prev => {
      if (prev.includes(filter)) {
        return prev.filter(f => f !== filter);
      } else {
        return [...prev, filter];
      }
    });
  };

  const clearAllFilters = () => {
    if (!isMountedRef.current) return;
    setActiveFilters([]);
  };

  // CORRECTION: Vérification sécurisée si l'utilisateur est inscrit
  const isUserEnrolled = (session: any) => {
    if (!user || !session || !Array.isArray(session.enrollments)) return false;
    return session.enrollments.some((e: any) => 
      e && e.user_id === user.id && 
      ['paid', 'included_by_subscription'].includes(e.status)
    );
  };

  // CORRECTION: Vérification sécurisée si l'utilisateur est l'hôte
  const isUserHost = (session: any) => {
    return user && session && session.host_id === user.id;
  };

  // CORRECTION: Obtenir le nombre de participants de manière sécurisée
  const getParticipantCount = (session: any) => {
    if (!session || !Array.isArray(session.enrollments)) return 0;
    return session.enrollments.filter((e: any) => 
      e && ['paid', 'included_by_subscription'].includes(e.status)
    ).length;
  };

  // CORRECTION: Formater la date avec gestion d'erreur
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return "Date invalide";
      
      return date.toLocaleDateString('fr-FR', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      console.error("Erreur formatage date:", error);
      return "Date invalide";
    }
  };

  // CORRECTION: Obtenir le nombre de sessions par filtre de manière sécurisée
  const getFilterCount = (filter: string) => {
    try {
      switch (filter) {
        case '1km':
          return sessions.filter(s => s && Number(s.distance_km) === 1).length;
        case '3km':
          return sessions.filter(s => s && Number(s.distance_km) === 3).length;
        case '5km':
          return sessions.filter(s => s && Number(s.distance_km) === 5).length;
        case '10km':
          return sessions.filter(s => s && Number(s.distance_km) === 10).length;
        case '15km':
          return sessions.filter(s => s && Number(s.distance_km) === 15).length;
        case 'mixte':
          return sessions.filter(s => s && s.session_type === 'mixed').length;
        case 'women_only':
          return sessions.filter(s => s && s.session_type === 'women_only').length;
        case 'men_only':
          return sessions.filter(s => s && s.session_type === 'men_only').length;
        case 'faible':
          return sessions.filter(s => s && s.intensity === 'low').length;
        case 'moyenne':
          return sessions.filter(s => s && s.intensity === 'medium').length;
        case 'elevee':
          return sessions.filter(s => s && s.intensity === 'high').length;
        default:
          return 0;
      }
    } catch (error) {
      console.error("Erreur calcul filtre:", error);
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
              <Button onClick={fetchSessions} variant="outline" disabled={loading}>
                {loading ? "Chargement..." : "Réessayer"}
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
      
      {/* CORRECTION: Map container avec gestion d'erreur */}
      <div className="flex-1 relative main-content">
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
            {/* CORRECTION: Carte avec données formatées et validation */}
            <LeafletMeetRunMap 
              sessions={filteredSessions.map(session => {
                if (!session) return null;
                
                try {
                  return {
                    id: session.id,
                    title: session.title || 'Session sans titre',
                    date: session.scheduled_at,
                    location_lat: Number(session.start_lat),
                    location_lng: Number(session.start_lng),
                    end_lat: session.end_lat ? Number(session.end_lat) : null,
                    end_lng: session.end_lng ? Number(session.end_lng) : null,
                    blur_radius_m: session.blur_radius_m || 1000,
                    area_hint: session.location_hint || session.area_hint,
                    max_participants: session.max_participants || 10,
                    price_cents: session.price_cents || 0,
                    distance_km: Number(session.distance_km) || 0,
                    intensity: session.intensity || 'medium',
                    host_id: session.host_id,
                    enrollments: session.enrollments || [],
                    host_profile: session.host_profile
                  };
                } catch (error) {
                  console.error("Erreur formatage session pour carte:", error);
                  return null;
                }
              }).filter(Boolean)}
              onSessionSelect={(sessionId) => {
                try {
                  const session = sessions.find(s => s && s.id === sessionId);
                  if (session) {
                    setSelectedSession(session);
                  } else {
                    navigate(`/session/${sessionId}`);
                  }
                } catch (error) {
                  console.error("Erreur sélection session:", error);
                }
              }}
              className="h-full"
              isLoading={loading}
            />

            {/* Floating Filter Bar */}
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
                    {['1km', '3km', '5km', '10km', '15km'].map(filter => (
                      <Button 
                        key={filter}
                        variant={activeFilters.includes(filter) ? "sport" : "sportSecondary"} 
                        size="sm"
                        onClick={() => toggleFilter(filter)}
                        className="whitespace-nowrap"
                      >
                        {filter} ({getFilterCount(filter)})
                      </Button>
                    ))}
                    
                    {/* Filtres de type */}
                    <Button 
                      variant={activeFilters.includes('mixte') ? "sport" : "sportSecondary"} 
                      size="sm"
                      onClick={() => toggleFilter('mixte')}
                      className="whitespace-nowrap"
                    >
                      Mixte ({getFilterCount('mixte')})
                    </Button>
                    
                    {/* Filtres d'intensité */}
                    {['faible', 'moyenne', 'elevee'].map(filter => {
                      const labels = { faible: 'Faible', moyenne: 'Moyenne', elevee: 'Élevée' };
                      return (
                        <Button 
                          key={filter}
                          variant={activeFilters.includes(filter) ? "sport" : "sportSecondary"} 
                          size="sm"
                          onClick={() => toggleFilter(filter)}
                          className="whitespace-nowrap"
                        >
                          {labels[filter as keyof typeof labels]} ({getFilterCount(filter)})
                        </Button>
                      );
                    })}
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
                        <h4 className="font-semibold text-sport-black">{selectedSession.title || 'Session'}</h4>
                        <p className="text-sm text-sport-gray flex items-center gap-1">
                          <MapPin size={14} />
                          {isUserEnrolled(selectedSession) || isUserHost(selectedSession) || hasActiveSubscription
                            ? selectedSession.location_hint || selectedSession.area_hint || "Lieu exact disponible"
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
                        📅 {formatDate(selectedSession.scheduled_at || selectedSession.date)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users size={14} />
                        {getParticipantCount(selectedSession) + 1}/{selectedSession.max_participants || 0} coureurs
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
                       getParticipantCount(selectedSession) < (selectedSession.max_participants || 0) - 1 && (
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