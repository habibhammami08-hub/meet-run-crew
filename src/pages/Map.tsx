// src/pages/Map.tsx - Version moderne avec authentification intégrée
import { useEffect, useMemo, useRef, useState } from "react";
import { GoogleMap, Polyline, MarkerF } from "@react-google-maps/api";
import { useNavigate } from "react-router-dom";
import { getSupabase } from "@/integrations/supabase/client";
import polyline from "@mapbox/polyline";
import { dbToUiIntensity } from "@/lib/sessions/intensity";
import { useAuth } from "@/hooks/useAuth";
import { MapErrorBoundary } from "@/components/MapErrorBoundary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Clock, Users, Filter, RefreshCw, Navigation, Calendar, Zap } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type LatLng = { lat: number; lng: number; };  
type SessionRow = {  
  id: string;  
  title: string;  
  scheduled_at: string;  
  start_lat: number; start_lng: number;  
  end_lat: number | null; end_lng: number | null;  
  distance_km: number | null;  
  route_polyline: string | null;  
  intensity: string | null;  
  session_type: string | null;  
  blur_radius_m?: number | null;  
  location_lat?: number;  
  location_lng?: number;  
  host_id?: string;
  location_hint?: string;
  max_participants?: number;
  distanceFromUser?: number;
};

// Calcul de distance haversine
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Brouillage déterministe
function seededNoise(seed: string) {  
  let h = 2166136261;  
  for (let i=0; i<seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }  
  const u = ((h >>> 0) % 10000) / 10000;  
  const v = (((h * 48271) >>> 0) % 10000) / 10000;  
  return { u, v };  
}  

function jitterDeterministic(lat:number, lng:number, meters:number, seed:string): LatLng {  
  const r = meters / 111320;
  const { u, v } = seededNoise(seed);  
  const w = r * Math.sqrt(u), t = 2 * Math.PI * v;  
  return { lat: lat + w * Math.cos(t), lng: lng + w * Math.sin(t) };  
}

function MapPageInner() {  
  const navigate = useNavigate();  
  const supabase = getSupabase();  
  
  // Utilisation du hook useAuth pour l'authentification
  const { user: currentUser, hasActiveSubscription: hasSub, loading: authLoading } = useAuth();
  
  const [center, setCenter] = useState<LatLng>({ lat: 48.8566, lng: 2.3522 });  
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);  
  const [loading, setLoading] = useState(true);  
  const [error, setError] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [filterRadius, setFilterRadius] = useState<string>("all");
  const [filterIntensity, setFilterIntensity] = useState<string>("all");
  const [filterSessionType, setFilterSessionType] = useState<string>("all");

  // Refs pour cleanup
  const mountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const channelRef = useRef<any>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout>();

  // Fonction pour convertir l'intensité UI vers DB
  const uiToDbIntensity = (uiIntensity: string): string | null => {
    const mapping: Record<string, string> = {
      "marche": "low",
      "course modérée": "medium", 
      "course intensive": "high"
    };
    return mapping[uiIntensity] || null;
  };

  // Icônes de markers personnalisées
  const createCustomMarkerIcon = (isOwnSession: boolean, isSubscribed: boolean, isSelected: boolean = false) => {
    const size = isOwnSession ? 20 : (isSelected ? 18 : 14);
    const color = isOwnSession ? '#dc2626' : (isSelected ? '#3b82f6' : (isSubscribed ? '#065f46' : '#047857'));
    
    const svg = `<svg width="${size}" height="${size + 6}" xmlns="http://www.w3.org/2000/svg">
      <path d="M${size/2} ${size + 6} L${size/2 - 4} ${size - 2} Q${size/2} ${size - 6} ${size/2 + 4} ${size - 2} Z" fill="${color}"/>
      <circle cx="${size/2}" cy="${size/2}" r="${size/2-2}" fill="${color}" stroke="white" stroke-width="2"/>
      ${isOwnSession ? `<circle cx="${size/2}" cy="${size/2}" r="${size/4}" fill="white"/>` : ''}
      ${isSelected ? `<circle cx="${size/2}" cy="${size/2}" r="2" fill="white"/>` : ''}
    </svg>`;
    
    if (typeof window !== 'undefined' && window.google) {
      return {
        url: 'data:image/svg+xml,' + encodeURIComponent(svg),
        scaledSize: new window.google.maps.Size(size, size + 6),
        anchor: new window.google.maps.Point(size/2, size + 6),
      };
    }
    return { url: 'data:image/svg+xml,' + encodeURIComponent(svg) };
  };

  // Geolocalisation
  useEffect(() => {  
    if (!navigator.geolocation || !mountedRef.current) return;
    
    const successCallback = (position: GeolocationPosition) => {
      if (!mountedRef.current) return;
      const userPos = { lat: position.coords.latitude, lng: position.coords.longitude };
      setCenter(userPos);
      setUserLocation(userPos);
    };
    
    const errorCallback = (error: GeolocationPositionError) => {
      if (!mountedRef.current) return;
      console.warn("[map] Geolocation error:", error);
    };
    
    navigator.geolocation.getCurrentPosition(
      successCallback, errorCallback,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  }, []);

  // Fetch sessions
  const fetchSessions = async () => {  
    if (!supabase || !mountedRef.current) return;
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    
    setLoading(true);
    setError(null);
    
    try {  
      if (signal.aborted || !mountedRef.current) return;

      const now = new Date();
      const cutoffDate = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      
      const { data, error } = await supabase  
        .from("sessions")  
        .select("id,title,scheduled_at,start_lat,start_lng,end_lat,end_lng,distance_km,route_polyline,intensity,session_type,blur_radius_m,host_id,location_hint,max_participants")
        .gte("scheduled_at", cutoffDate.toISOString())
        .eq("status", "published")
        .order("scheduled_at", { ascending: true })  
        .limit(500);

      if (signal.aborted || !mountedRef.current) return;

      if (error) {  
        setError(`Erreur lors du chargement des sessions: ${error.message}`);
        return;
      }

      const mappedSessions = (data ?? []).map((s) => ({
        ...s,  
        location_lat: s.start_lat,  
        location_lng: s.start_lng,
        distanceFromUser: userLocation ? 
          calculateDistance(userLocation.lat, userLocation.lng, s.start_lat, s.start_lng) : null
      }));

      if (!signal.aborted && mountedRef.current) {
        setSessions(mappedSessions);
      }
    } catch (e: any) {
      if (e.name !== 'AbortError' && mountedRef.current) {
        setError(`Une erreur est survenue: ${e.message}`);
      }
    } finally {  
      if (!signal.aborted && mountedRef.current) {
        setLoading(false);
      }
    }
  };

  // Debounced refresh
  const debouncedRefresh = () => {
    if (!mountedRef.current) return;
    clearTimeout(debounceTimeoutRef.current);
    debounceTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current) fetchSessions();
    }, 2000);
  };

  // Filtrage des sessions
  const filteredSessions = useMemo(() => {
    let filtered = sessions;
    
    if (userLocation && filterRadius !== "all") {
      const radius = parseInt(filterRadius);
      filtered = filtered.filter(s => 
        s.distanceFromUser !== null && s.distanceFromUser <= radius
      );
    }
    
    if (filterIntensity !== "all") {
      const dbIntensity = uiToDbIntensity(filterIntensity);
      if (dbIntensity) {
        filtered = filtered.filter(s => s.intensity === dbIntensity);
      }
    }

    if (filterSessionType !== "all") {
      filtered = filtered.filter(s => s.session_type === filterSessionType);
    }
    
    return filtered;
  }, [sessions, userLocation, filterRadius, filterIntensity, filterSessionType]);

  // Sessions les plus proches filtrées
  const filteredNearestSessions = useMemo(() => {
    return filteredSessions
      .filter(s => s.distanceFromUser !== null && s.distanceFromUser <= 25)
      .sort((a, b) => (a.distanceFromUser || 0) - (b.distanceFromUser || 0))
      .slice(0, 6);
  }, [filteredSessions]);

  // Effects
  useEffect(() => { 
    console.log('[map] Main effect triggered - Auth state:', { authLoading, currentUser: currentUser?.id, hasSub });
    
    // CORRECTION: Ne plus attendre l'auth - charger les sessions immédiatement
    if (mountedRef.current) {
      console.log('[map] Loading sessions without waiting for auth...');
      fetchSessions(); 
    }
  }, [userLocation]); // Supprimer authLoading, currentUser, hasSub des dépendances

  // Effect séparé pour les mises à jour d'auth (quand ça marche)
  useEffect(() => {
    if (!authLoading && currentUser && mountedRef.current) {
      console.log('[map] Auth resolved, refreshing sessions...');
      fetchSessions();
    }
  }, [authLoading, currentUser, hasSub]);

  useEffect(() => {  
    if (!supabase || !mountedRef.current) return;  
    
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }
    
    const ch = supabase.channel(`sessions-map-${Date.now()}`)  
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, () => {  
        if (mountedRef.current) debouncedRefresh();
      })  
      .subscribe();
    
    channelRef.current = ch;
    
    return () => { 
      clearTimeout(debounceTimeoutRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
      if (channelRef.current && supabase) supabase.removeChannel(channelRef.current);
    };  
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimeout(debounceTimeoutRef.current);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      if (channelRef.current && supabase) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);

  const mapContainerStyle = useMemo(() => ({ 
    width: "100%", 
    height: "60vh",
    minHeight: "400px",
    borderRadius: "16px"
  }), []);

  const pathFromPolyline = (p?: string | null): LatLng[] => {  
    if (!p) return [];  
    try { return polyline.decode(p).map(([lat, lng]) => ({ lat, lng })); } catch { return []; }  
  };

  return (  
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Header moderne */}
      <div className="bg-white/80 backdrop-blur-md border-b border-gray-200/50 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-blue-600 rounded-xl flex items-center justify-center">
                <MapPin className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Sessions disponibles</h1>
                {currentUser && (
                  <p className="text-sm text-gray-600">
                    Connecté{hasSub && ' • Abonnement actif'}
                  </p>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchSessions()}
                disabled={loading}
                className="flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Actualiser
              </Button>
              
              {!hasSub && (
                <Button
                  size="sm"
                  onClick={() => navigate("/subscription")}
                  className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700"
                >
                  S'abonner
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Colonne gauche - Sessions proches */}
          <div className="lg:col-span-1 space-y-6">
            {/* Filtres */}
            <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Filter className="w-5 h-5 text-blue-600" />
                  Filtres
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    Rayon de recherche
                  </label>
                  <Select value={filterRadius} onValueChange={setFilterRadius}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Toutes les sessions</SelectItem>
                      <SelectItem value="5">5 km</SelectItem>
                      <SelectItem value="10">10 km</SelectItem>
                      <SelectItem value="25">25 km</SelectItem>
                      <SelectItem value="50">50 km</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    Intensité
                  </label>
                  <Select value={filterIntensity} onValueChange={setFilterIntensity}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Toutes les intensités</SelectItem>
                      <SelectItem value="marche">Marche</SelectItem>
                      <SelectItem value="course modérée">Course modérée</SelectItem>
                      <SelectItem value="course intensive">Course intensive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    Type de session
                  </label>
                  <Select value={filterSessionType} onValueChange={setFilterSessionType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous types</SelectItem>
                      <SelectItem value="mixed">Mixte</SelectItem>
                      <SelectItem value="women_only">Femmes uniquement</SelectItem>
                      <SelectItem value="men_only">Hommes uniquement</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Sessions les plus proches */}
            <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Navigation className="w-5 h-5 text-green-600" />
                  Sessions près de vous
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="animate-pulse bg-gray-200 h-20 rounded-lg"></div>
                    ))}
                  </div>
                ) : filteredNearestSessions.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <MapPin className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">Aucune session proche trouvée</p>
                    <p className="text-xs mt-1">
                      {filterRadius !== "all" || filterIntensity !== "all" || filterSessionType !== "all"
                        ? "Essayez d'élargir vos filtres"
                        : "Activez la géolocalisation"
                      }
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {filteredNearestSessions.map(session => {
                      const isOwnSession = currentUser && session.host_id === currentUser.id;
                      const shouldBlur = !hasSub && !isOwnSession;
                      
                      return (
                        <div
                          key={session.id}
                          className={`p-4 rounded-lg border cursor-pointer transition-all hover:shadow-md ${
                            selectedSession === session.id 
                              ? 'border-blue-500 bg-blue-50' 
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                          onClick={() => {
                            setSelectedSession(selectedSession === session.id ? null : session.id);
                            setCenter({ lat: session.start_lat, lng: session.start_lng });
                          }}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="font-semibold text-gray-900 text-sm line-clamp-1">
                              {session.title}
                            </h3>
                            {session.distanceFromUser && (
                              <Badge variant="secondary" className="text-xs">
                                {session.distanceFromUser.toFixed(1)} km
                              </Badge>
                            )}
                          </div>
                          
                          <div className="space-y-1 text-xs text-gray-600">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(session.scheduled_at).toLocaleDateString('fr-FR', {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </div>
                            
                            <div className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {shouldBlur 
                                ? `Zone approximative (${session.blur_radius_m || 1000}m)`
                                : session.location_hint || 'Lieu exact'
                              }
                            </div>
                            
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 flex-wrap">
                                {session.intensity && (
                                  <Badge variant="outline" className="text-xs py-0">
                                    <Zap className="w-2 h-2 mr-1" />
                                    {dbToUiIntensity(session.intensity)}
                                  </Badge>
                                )}
                                {session.session_type && session.session_type !== 'mixed' && (
                                  <Badge variant="secondary" className="text-xs py-0">
                                    <Users className="w-2 h-2 mr-1" />
                                    {session.session_type === 'women_only' ? 'Femmes' : 
                                     session.session_type === 'men_only' ? 'Hommes' : 'Mixte'}
                                  </Badge>
                                )}
                                {session.distance_km && (
                                  <span className="text-gray-500 text-xs">{session.distance_km} km</span>
                                )}
                              </div>
                              
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs h-6 px-2"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/session/${session.id}`);
                                }}
                              >
                                Voir
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Colonne droite - Carte */}
          <div className="lg:col-span-2">
            <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm overflow-hidden">
              <CardContent className="p-0">
                <GoogleMap  
                  mapContainerStyle={mapContainerStyle}  
                  center={center}  
                  zoom={13}  
                  options={{ 
                    mapTypeControl: false, 
                    streetViewControl: false, 
                    fullscreenControl: false,
                    gestureHandling: "greedy",
                    zoomControl: true,
                    scaleControl: false,
                    rotateControl: false,
                    styles: [
                      {
                        featureType: "poi",
                        elementType: "labels",
                        stylers: [{ visibility: "off" }]
                      },
                      {
                        featureType: "transit",
                        elementType: "labels",
                        stylers: [{ visibility: "off" }]
                      }
                    ]
                  }}  
                >
                  {/* Marker position utilisateur */}
                  {userLocation && (
                    <MarkerF
                      position={userLocation}
                      icon={{
                        url: 'data:image/svg+xml,' + encodeURIComponent(`
                          <svg width="16" height="16" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="8" cy="8" r="8" fill="#3b82f6" stroke="white" stroke-width="2"/>
                            <circle cx="8" cy="8" r="3" fill="white"/>
                          </svg>
                        `),
                        scaledSize: new window.google.maps.Size(16, 16),
                        anchor: new window.google.maps.Point(8, 8),
                      }}
                      title="Votre position"
                    />
                  )}

                  {/* Markers des sessions */}
                  {filteredSessions.map(s => {  
                    if (!mountedRef.current) return null;
                    
                    const start = { lat: s.location_lat ?? s.start_lat, lng: s.location_lng ?? s.start_lng };  
                    const radius = s.blur_radius_m ?? 1000;  
                    const isOwnSession = currentUser && s.host_id === currentUser.id;
                    const shouldBlur = !hasSub && !isOwnSession;
                    const startShown = shouldBlur ? jitterDeterministic(start.lat, start.lng, radius, s.id) : start;
                    const isSelected = selectedSession === s.id;
                    
                    const showPolyline = hasSub && s.route_polyline && !isOwnSession;
                    const path = showPolyline ? pathFromPolyline(s.route_polyline) : [];

                    const markerIcon = createCustomMarkerIcon(!!isOwnSession, hasSub, isSelected);

                    return (  
                      <div key={s.id}>  
                        <MarkerF   
                          position={startShown}   
                          title={`${s.title} • ${dbToUiIntensity(s.intensity || undefined)}${isOwnSession ? ' (Votre session)' : ''}`}
                          icon={markerIcon}
                          onClick={() => {
                            if (!mountedRef.current) return;
                            setSelectedSession(s.id);
                          }}  
                        />  
                        {showPolyline && path.length > 1 && (  
                          <Polyline 
                            path={path} 
                            options={{ 
                              clickable: false, 
                              strokeOpacity: 0.8, 
                              strokeWeight: 3,
                              strokeColor: isSelected ? '#3b82f6' : '#059669'
                            }} 
                          />  
                        )}  
                      </div>  
                    );  
                  })}  
                </GoogleMap>  
              </CardContent>
            </Card>

            {/* Informations session sélectionnée */}
            {selectedSession && (
              <Card className="mt-4 shadow-lg border-0 bg-white/80 backdrop-blur-sm">
                <CardContent className="p-4">
                  {(() => {
                    const session = sessions.find(s => s.id === selectedSession);
                    if (!session) return null;
                    
                    const isOwnSession = currentUser && session.host_id === currentUser.id;
                    const shouldBlur = !hasSub && !isOwnSession;
                    
                    return (
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg text-gray-900 mb-2">
                            {session.title}
                          </h3>
                          
                          <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 mb-4">
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4" />
                              {new Date(session.scheduled_at).toLocaleDateString('fr-FR', {
                                day: 'numeric',
                                month: 'long',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4" />
                              {shouldBlur 
                                ? `Zone approximative`
                                : session.location_hint || 'Lieu exact'
                              }
                            </div>
                            
                            {session.distance_km && (
                              <div className="flex items-center gap-2">
                                <span>📏</span>
                                {session.distance_km} km
                              </div>
                            )}
                            
                            {session.distanceFromUser && (
                              <div className="flex items-center gap-2">
                                <Navigation className="w-4 h-4" />
                                À {session.distanceFromUser.toFixed(1)} km de vous
                              </div>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-2 mb-4">
                            {session.intensity && (
                              <Badge variant="secondary">
                                <Zap className="w-3 h-3 mr-1" />
                                {dbToUiIntensity(session.intensity)}
                              </Badge>
                            )}
                            {session.max_participants && (
                              <Badge variant="outline">
                                <Users className="w-3 h-3 mr-1" />
                                Max {session.max_participants}
                              </Badge>
                            )}
                            {session.session_type && session.session_type !== 'mixed' && (
                              <Badge variant="secondary">
                                <Users className="w-3 h-3 mr-1" />
                                {session.session_type === 'women_only' ? 'Femmes uniquement' : 'Hommes uniquement'}
                              </Badge>
                            )}
                          </div>
                        </div>
                        
                        <Button
                          onClick={() => navigate(`/session/${session.id}`)}
                          className="ml-4"
                        >
                          Voir détails
                        </Button>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* États de chargement/erreur */}
        {loading && (  
          <div className="fixed bottom-4 right-4 bg-white shadow-lg rounded-lg p-4 flex items-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
            <span className="text-sm font-medium">Chargement des sessions...</span>
          </div>
        )}  
        
        {error && (
          <div className="fixed bottom-4 right-4 bg-red-50 border border-red-200 shadow-lg rounded-lg p-4 max-w-sm">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs">!</span>
              </div>
              <div>
                <p className="text-sm font-medium text-red-800">Erreur de chargement</p>
                <p className="text-xs text-red-600">{error}</p>
              </div>
            </div>
          </div>
        )}  
        
        {!loading && filteredSessions.length === 0 && (
          <Card className="mt-6 shadow-lg border-0 bg-white/80 backdrop-blur-sm">
            <CardContent className="text-center py-12">
              <MapPin className="mx-auto h-16 w-16 mb-4 text-gray-300" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Aucune session trouvée
              </h3>
              <p className="text-gray-500 mb-6">
                {filterRadius !== "all" || filterIntensity !== "all" || filterSessionType !== "all"
                  ? "Essayez d'élargir vos filtres de recherche"
                  : "Il n'y a pas de sessions disponibles pour le moment"
                }
              </p>
              <div className="flex justify-center gap-3">
                <Button 
                  variant="outline"
                  onClick={() => {
                    setFilterRadius("all");
                    setFilterIntensity("all");
                    setFilterSessionType("all");
                  }}
                >
                  Réinitialiser les filtres
                </Button>
                <Button onClick={() => navigate("/create")}>
                  Créer une session
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>  
  );  
}

export default function MapPage() {
  return (
    <MapErrorBoundary>
      <MapPageInner />
    </MapErrorBoundary>
  );
}