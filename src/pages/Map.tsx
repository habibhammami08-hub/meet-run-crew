import { useEffect, useMemo, useRef, useState, useCallback } from "react";
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
import { MapPin, Users, Filter, Navigation, Calendar, Zap, Crown, User } from "lucide-react"; // ← RefreshCw retiré, User ajouté
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGeolocationNotifications } from "@/hooks/useGeolocationNotifications";


// Auth route (adjust if your auth page differs)
const AUTH_ROUTE = "/auth";

// ————————————————————————————————————————————
// Types
// ————————————————————————————————————————————

type LatLng = { lat: number; lng: number };

type SessionRow = {
  id: string;
  title: string;
  description?: string | null;
  scheduled_at: string;
  start_lat: number;
  start_lng: number;
  end_lat: number | null;
  end_lng: number | null;
  distance_km: number | null;
  route_polyline: string | null;
  intensity: string | null;
  session_type: "mixed" | "women_only" | "men_only" | null;
  blur_radius_m?: number | null;
  location_lat?: number;
  location_lng?: number;
  host_id?: string;
  location_hint?: string;
  max_participants?: number;
  distanceFromUser?: number | null;

  // ▼▼▼ AJOUT : compteur dénormalisé depuis la DB
  participants_count?: number;
  // ▲▲▲
};

// ————————————————————————————————————————————
// Utils
// ————————————————————————————————————————————

function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng/2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function seededNoise(seed: string) {
  let h = 2166136261;
  for (let i=0; i<seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = ((h >>> 0) % 10000) / 10000;
  const v = (((h * 48271) >>> 0) % 10000) / 10000;
  return { u, v };
}

function jitterDeterministic(lat:number, lng:number, meters:number, seed:string): LatLng {
  const { u, v } = seededNoise(seed);
  const w = meters * Math.sqrt(u);
  const t = 2 * Math.PI * v;
  const dLat = w / 111320;
  const dLng = w / (111320 * Math.cos(lat * Math.PI/180));
  return { lat: lat + dLat * Math.cos(t), lng: lng + dLng * Math.sin(t) };
}

const uiToDbIntensity = (uiIntensity: string): string | null => {
  const mapping: Record<string, string> = {
    "marche": "low",
    "course modérée": "medium",
    "course intensive": "high",
  };
  return mapping[uiIntensity] || null;
};

const isOwnSession = (s: SessionRow, userId?: string) => !!(userId && s.host_id === userId);

const polyCache = new Map<string, LatLng[]>();
const pathFromPolyline = (p?: string | null): LatLng[] => {
  if (!p) return [];
  const cached = polyCache.get(p);
  if (cached) return cached;
  try {
    const path = polyline.decode(p).map(([lat, lng]) => ({ lat, lng }));
    polyCache.set(p, path);
    return path;
  } catch {
    return [];
  }
};

// ————————————————————————————————————————————
// Icônes uniformisées (petits points) : vert = départ, rouge = arrivée, bleu = position utilisateur
// ————————————————————————————————————————————

const DOT_SIZE = 12; // taille uniforme pour tous les points

function createDotIcon(color: string, size = DOT_SIZE) {
  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="${color}" stroke="white" stroke-width="2"/>
  </svg>`;
  const url = "data:image/svg+xml," + encodeURIComponent(svg);
  const g = typeof window !== "undefined" ? (window as any).google : undefined;
  return g?.maps?.Size && g?.maps?.Point
    ? { url, scaledSize: new g.maps.Size(size, size), anchor: new g.maps.Point(size/2, size/2) }
    : { url };
}

const START_DOT_COLOR = "#10b981";  // vert
const END_DOT_COLOR   = "#ef4444";  // rouge
const USER_DOT_COLOR  = "#3b82f6";  // bleu

// ————————————————————————————————————————————
// Pictogrammes de type 
// ————————————————————————————————————————————

type TypeMeta = {
  label: string;
  badgeVariant: "outline" | "secondary";
  renderIcon: (className?: string) => JSX.Element;
};

function getTypeMeta(t: SessionRow["session_type"]): TypeMeta {
  if (t === "women_only") {
    return {
      label: "Femmes uniquement",
      badgeVariant: "secondary",
      renderIcon: (cls = "") => <span className={`mr-1 ${cls}`} aria-hidden>♀</span>,
    };
  }
  if (t === "men_only") {
    return {
      label: "Hommes uniquement",
      badgeVariant: "secondary",
      renderIcon: (cls = "") => <span className={`mr-1 ${cls}`} aria-hidden>♂</span>,
    };
  }
  // mixed par défaut
  return {
    label: "Mixte",
    badgeVariant: "outline",
    renderIcon: (cls = "") => <Users className={`w-3 h-3 mr-1 ${cls}`} />,
  };
}

// ————————————————————————————————————————————
// Composant
// ————————————————————————————————————————————

function MapPageInner() {
  const navigate = useNavigate();
  const supabase = getSupabase();
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
  const [hasTriedGeolocation, setHasTriedGeolocation] = useState(false);

  // Nouveaux états : sessions où l’utilisateur est INSCRIT
  const [mySessionIds, setMySessionIds] = useState<Set<string>>(new Set());

  const mountedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const channelRef = useRef<any>(null);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { handleGeolocationError } = useGeolocationNotifications();

  const mapOptions = useMemo(() => ({
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    gestureHandling: "greedy" as const,
    zoomControl: true,
    scaleControl: false,
    rotateControl: false,
    styles: [
      { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
      { featureType: "transit", elementType: "labels", stylers: [{ visibility: "off" }] },
    ],
  }), []);

  const requestGeolocation = useCallback(() => {
    if (!navigator.geolocation) return;
    setHasTriedGeolocation(true);

    const successCallback = (position: GeolocationPosition) => {
      if (!mountedRef.current) return;
      const userPos = { lat: position.coords.latitude, lng: position.coords.longitude };
      setCenter(userPos);
      setUserLocation(userPos);
    };

    const errorCallback = (err: GeolocationPositionError) => {
      if (!mountedRef.current) return;
      console.warn("[map] Geolocation error:", err);
      handleGeolocationError(err);
    };

    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    navigator.geolocation.getCurrentPosition(
      successCallback,
      errorCallback,
      {
        enableHighAccuracy: isMobile,
        timeout: isMobile ? 15000 : 10000,
        maximumAge: 300000,
      }
    );
  }, [handleGeolocationError]);

  useEffect(() => {
    if (!hasTriedGeolocation) requestGeolocation();
  }, [requestGeolocation, hasTriedGeolocation]);

  const fetchSessions = useCallback(async () => {
    if (!supabase || !mountedRef.current) return;
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const { signal } = controller;

    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const cutoffDate = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const { data, error } = await supabase
        .from("sessions")
        .select("id,title,description,scheduled_at,start_lat,start_lng,end_lat,end_lng,distance_km,route_polyline,intensity,session_type,blur_radius_m,host_id,location_hint,max_participants,participants_count") // ← AJOUT participants_count
        .gte("scheduled_at", cutoffDate.toISOString())
        .eq("status", "published")
        .order("scheduled_at", { ascending: true })
        .limit(500);

      if (signal.aborted || !mountedRef.current) return;
      if (error) {
        setError(`Erreur lors du chargement des sessions: ${error.message}`);
        return;
      }

      const mapped = (data ?? []).map((s) => ({
        ...s,
        location_lat: s.start_lat,
        location_lng: s.start_lng,
      })) as SessionRow[];
      setSessions(mapped);
    } catch (e: any) {
      if (e?.name !== "AbortError" && mountedRef.current) setError(`Une erreur est survenue: ${e.message}`);
    } finally {
      if (!signal.aborted && mountedRef.current) setLoading(false);
    }
  }, [supabase]);

  // Récupérer les sessions où l’utilisateur est inscrit (paid / included_by_subscription / confirmed)
  const fetchMyEnrollments = useCallback(async () => {
    if (!supabase || !currentUser) {
      setMySessionIds(new Set());
      return;
    }
    try {
      const { data, error } = await supabase
        .from("enrollments")
        .select("session_id, status")
        .eq("user_id", currentUser.id)
        .in("status", ["paid", "included_by_subscription", "confirmed"]);

      if (error) {
        console.warn("[map] enrollments error:", error.message);
        setMySessionIds(new Set());
        return;
      }
      const ids = new Set<string>((data ?? []).map((e: any) => e.session_id));
      setMySessionIds(ids);
    } catch (e) {
      console.warn("[map] fetchMyEnrollments exception:", e);
      setMySessionIds(new Set());
    }
  }, [supabase, currentUser]);

  const debouncedRefresh = useCallback(() => {
    if (!mountedRef.current) return;
    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
    debounceTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current) fetchSessions();
    }, 2000);
  }, [fetchSessions]);

  const sessionsWithDistance = useMemo(() => {
    if (!userLocation) return sessions.map(s => ({ ...s, distanceFromUser: null as number | null }));
    return sessions.map(s => ({
      ...s,
      distanceFromUser: calculateDistance(userLocation.lat, userLocation.lng, s.start_lat, s.start_lng),
    }));
  }, [sessions, userLocation]);

  // IMPORTANT : défloute si l’utilisateur est inscrit à CETTE session
  const isEnrolledIn = useCallback((id: string) => mySessionIds.has(id), [mySessionIds]);

  const shouldBlur = useCallback(
    (s: SessionRow) => !(hasSub || isOwnSession(s, currentUser?.id) || isEnrolledIn(s.id)),
    [hasSub, currentUser?.id, isEnrolledIn]
  );

  // ▼▼▼ AJOUT : tick d’horloge pour appliquer la règle de retrait 31/15 min en continu
  const [__tick, set__tick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => set__tick(t => t + 1), 60_000);
    return () => clearInterval(i);
  }, []);
  // ▲▲▲

  const filteredSessions = useMemo(() => {
    let filtered = sessionsWithDistance;

    if (userLocation && filterRadius !== "all") {
      const radius = parseInt(filterRadius);
      filtered = filtered.filter(s => s.distanceFromUser !== null && (s.distanceFromUser as number) <= radius);
    }

    if (filterIntensity !== "all") {
      const dbIntensity = uiToDbIntensity(filterIntensity);
      if (dbIntensity) filtered = filtered.filter(s => s.intensity === dbIntensity);
    }

    if (filterSessionType !== "all") filtered = filtered.filter(s => s.session_type === filterSessionType);

    // ▼▼▼ AJOUT : règle d’affichage des sessions sur la carte (31/15 min)
    // - Si participants_count <= 1  -> retirer 31 minutes avant le début
    // - Si participants_count >= 2  -> retirer 15 minutes avant le début
    // La colonne est NOT NULL (par défaut 1 si tu as suivi l’option A) ; sinon on applique le fallback strict 31 min.
    const now = Date.now();
    filtered = filtered.filter(s => {
      const minutesUntil = (new Date(s.scheduled_at).getTime() - now) / 60000;
      const count = (s.participants_count ?? 1); // fallback prudent à 1

      if (count <= 1) return minutesUntil >= 31;
      return minutesUntil >= 15;
    });
    // ▲▲▲

    return filtered;
  }, [sessionsWithDistance, userLocation, filterRadius, filterIntensity, filterSessionType, __tick]);

  const filteredNearestSessions = useMemo(() => (
    filteredSessions
      .filter(s => s.distanceFromUser !== null && (s.distanceFromUser as number) <= 25)
      .sort((a, b) => (a.distanceFromUser || 0) - (b.distanceFromUser || 0))
      .slice(0, 6)
  ), [filteredSessions]);

  // Mes sessions (inscrit OU hôte) à partir de TOUTES les sessions chargées (non filtrées), uniquement futures
  const myEnrolledSessions = useMemo(() => {
    const now = new Date();
    const arr = sessionsWithDistance.filter(s => {
      const isFuture = new Date(s.scheduled_at) > now;
      const isEnrolled = mySessionIds.has(s.id);
      const isHost = s.host_id === currentUser?.id;
      return isFuture && (isEnrolled || isHost);
    });
    return arr.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  }, [sessionsWithDistance, mySessionIds, currentUser?.id]);

  useEffect(() => {
    mountedRef.current = true;
    fetchSessions();
    if (currentUser) fetchMyEnrollments();

    return () => {
      mountedRef.current = false;
      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      if (channelRef.current && supabase) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [fetchSessions, fetchMyEnrollments, supabase, currentUser]);

  useEffect(() => {
    if (!authLoading && currentUser && mountedRef.current) {
      fetchSessions();
      fetchMyEnrollments();
    }
  }, [authLoading, currentUser, fetchSessions, fetchMyEnrollments]);

  useEffect(() => {
    if (!supabase || !mountedRef.current) return;
    if (channelRef.current) supabase.removeChannel(channelRef.current);

    const ch = supabase
      .channel(`sessions-map-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, () => {
        if (mountedRef.current) debouncedRefresh();
      })
      // réagit aussi aux changements sur les enrollments de l’utilisateur (pour refléter un paiement one-off / désinscription)
      .on("postgres_changes", { event: "*", schema: "public", table: "enrollments", filter: currentUser ? `user_id=eq.${currentUser.id}` : undefined }, () => {
        if (mountedRef.current) fetchMyEnrollments();
      })
      .subscribe();

    channelRef.current = ch;
    return () => {
      if (channelRef.current && supabase) supabase.removeChannel(channelRef.current);
    };
  }, [supabase, debouncedRefresh, fetchMyEnrollments, currentUser]);

  // Icône position utilisateur (bleu) — même taille que les autres
  const userMarkerIcon = useMemo(() => createDotIcon(USER_DOT_COLOR, DOT_SIZE), []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Header */}
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
                  <p className="text-sm text-gray-600">Connecté{hasSub && ' • Abonnement actif'}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {!userLocation && hasTriedGeolocation && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={requestGeolocation}
                  className="flex items-center gap-2"
                  aria-label="Me localiser"
                >
                  <Navigation className="w-4 h-4" />
                  Me localiser
                </Button>
              )}

              {/* ▼▼▼ Modifs header — Version PC : retirer Actualiser ; afficher Se connecter (non connecté) ou icône Profil (connecté) */}
              {!currentUser ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(AUTH_ROUTE)}
                  className="hidden md:inline-flex items-center gap-2"
                  aria-label="Se connecter"
                >
                  Se connecter
                </Button>
              ) : (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => navigate("/profile")}
                  className="hidden md:inline-flex"
                  aria-label="Profil"
                  title="Profil"
                >
                  <User className="w-5 h-5" />
                </Button>
              )}
              {/* ▲▲▲ */}

              {/* ⬇️ Icône MeetRun Unlimited si abonné, sinon bouton S'abonner */}
              {hasSub ? (
                <>
                  {/* Desktop badge bleu */}
                  <Button
                    size="sm"
                    onClick={() => navigate("/subscription")}
                    variant="secondary"
                    className="hidden md:inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-sm"
                    aria-label="Abonnement actif : gérer"
                    title="Abonnement actif : MeetRun Unlimited"
                  >
                    <Crown className="w-4 h-4" />
                    Unlimited
                  </Button>
                  {/* Mobile badge bleu */}
                  <Button
                    size="icon"
                    onClick={() => navigate("/subscription")}
                    className="md:hidden bg-blue-600 hover:bg-blue-700 text-white rounded-full"
                    aria-label="Abonnement actif"
                    title="Abonnement actif"
                  >
                    <Crown className="w-4 h-4" />
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  onClick={() => navigate("/subscription")}
                  className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700"
                >
                  S'abonner
                </Button>
              )}

              {/* ▼ Version Mobile : ajouter Se connecter à côté de S'abonner ; si connecté, icône Profil à côté */}
              {!currentUser ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(AUTH_ROUTE)}
                  className="md:hidden"
                  aria-label="Se connecter"
                >
                  Se connecter
                </Button>
              ) : (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => navigate("/profile")}
                  className="md:hidden"
                  aria-label="Profil"
                  title="Profil"
                >
                  <User className="w-5 h-5" />
                </Button>
              )}
              {/* ▲ */}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Carte */}
          <div className="lg:col-span-2 order-1 lg:order-2">
            <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm overflow-hidden">
              <CardContent className="p-0">
                <div className="h-[40vh] lg:h-[60vh] min-h-[300px] lg:min-h-[400px]">
                  <GoogleMap
                    mapContainerStyle={{ width: "100%", height: "100%" }}
                    center={center}
                    zoom={13}
                    options={mapOptions}
                    onClick={() => setSelectedSession(null)}
                  >
                    {userLocation && (
                      <MarkerF position={userLocation} icon={userMarkerIcon} title="Votre position" />
                    )}

                    {filteredSessions.map((s) => {
                      const own = isOwnSession(s, currentUser?.id);
                      const blur = shouldBlur(s);
                      const start = { lat: s.location_lat ?? s.start_lat, lng: s.location_lng ?? s.start_lng };
                      const startShown = blur ? jitterDeterministic(start.lat, start.lng, s.blur_radius_m ?? 1000, s.id) : start;
                      const selected = selectedSession === s.id;
                      const enrolled = isEnrolledIn(s.id);

                      // Le tracé + arrivée n'apparaît que pour la session sélectionnée, et pour hôte/abonné OU si inscrit à cette session
                      const allowPolyline = (hasSub || own || enrolled) && selected && !!s.route_polyline;
                      const path = allowPolyline ? pathFromPolyline(s.route_polyline) : [];

                      return (
                        <div key={s.id}>
                          {/* Départ — petit point vert */}
                          <MarkerF
                            position={startShown}
                            title={`${s.title} • ${dbToUiIntensity(s.intensity || undefined)}${own ? ' (Votre session)' : enrolled ? ' (Inscrit)' : ''}`}
                            icon={createDotIcon(START_DOT_COLOR)}
                            onClick={(e) => {
                              // @ts-ignore — google maps DOM event
                              e.domEvent?.stopPropagation?.();
                              setSelectedSession(selected ? null : s.id);
                            }}
                          />

                          {/* Itinéraire + Arrivée — petit point rouge */}
                          {allowPolyline && path.length > 1 && (
                            <>
                              <Polyline
                                path={path}
                                options={{ clickable: false, strokeOpacity: 0.9, strokeWeight: 4, strokeColor: '#3b82f6' }}
                              />
                              {s.end_lat !== null && s.end_lng !== null && (
                                <MarkerF
                                  position={{ lat: s.end_lat, lng: s.end_lng }}
                                  title="Arrivée"
                                  icon={createDotIcon(END_DOT_COLOR)}
                                  onClick={(e) => {
                                    // @ts-ignore — google maps DOM event
                                    e.domEvent?.stopPropagation?.();
                                    setSelectedSession(selected ? null : s.id);
                                  }}
                                />
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </GoogleMap>
                </div>
              </CardContent>
            </Card>

            {/* Fiche de la session sélectionnée */}
            {selectedSession && (
              <Card className="mt-4 shadow-lg border-0 bg-white/80 backdrop-blur-sm">
                <CardContent className="p-4">
                  {(() => {
                    const session = sessionsWithDistance.find(s => s.id === selectedSession);
                    if (!session) return null;

                    const blur = shouldBlur(session);
                    const { label: typeLabel, badgeVariant, renderIcon } = getTypeMeta(session.session_type);
                    const enrolled = isEnrolledIn(session.id);
                    const own = isOwnSession(session, currentUser?.id);

                    return (
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg text-gray-900 mb-1">{session.title}</h3>
                          {/* Description sous le titre */}
                          {session.description && (
                            <p className="text-sm text-gray-600 mb-3">
                              {session.description}
                            </p>
                          )}

                          <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 mb-4">
                            <div className="flex items-center gap-2">
  <Calendar className="w-4 h-4 text-blue-600" />
  <span className="inline-flex items-center rounded-full bg-blue-50 text-blue-700 px-2 py-1 text-[13px] font-semibold">
    {new Date(session.scheduled_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
  </span>
</div>
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4" />
                              {blur ? 'Zone approximative' : (session.location_hint || 'Lieu exact')}
                            </div>
                            {session.distance_km && (
                              <div className="flex items-center gap-2">
                                <span>📏</span>
                                {session.distance_km} km
                              </div>
                            )}
                            {session.distanceFromUser !== null && (
                              <div className="flex items-center gap-2">
                                <Navigation className="w-4 h-4" />
                                À {Number(session.distanceFromUser).toFixed(1)} km de vous
                              </div>
                            )}
                          </div>

                          {/* Badges: Inscrit, Hôte, intensité, distance, type, capacité */}
                          <div className="flex items-center gap-2 mb-4 flex-wrap">
                            {enrolled && <Badge className="bg-amber-100 text-amber-800">Inscrit</Badge>}
                            {own && <Badge variant="secondary">Hôte</Badge>}
                            {session.intensity && (
                              <Badge variant="secondary">
                                <Zap className="w-3 h-3 mr-1" />
                                {dbToUiIntensity(session.intensity)}
                              </Badge>
                            )}
                            {session.distance_km && (
                              <Badge variant="outline">
                                <span className="mr-1">📏</span>
                                {session.distance_km} km
                              </Badge>
                            )}
                            {session.session_type && (
                              <Badge variant={badgeVariant}>
                                {renderIcon("text-[12px] leading-none")}
                                {typeLabel}
                              </Badge>
                            )}
                            {session.max_participants && (
                              <Badge variant="outline">
                                <Users className="w-3 h-3 mr-1" />
                                Max {session.max_participants}
                              </Badge>
                            )}
                          </div>
                        </div>

                        <Button onClick={() => navigate(`/session/${session.id}`)} className="ml-4">Voir détails</Button>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            )}

            {/* —— VOS PROCHAINES SESSIONS (inscriptions) —— */}
            {currentUser && myEnrolledSessions.length > 0 && (
              <Card className="mt-6 shadow-lg border-0 bg-white/80 backdrop-blur-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Users className="w-5 h-5 text-amber-600" />
                    Vos prochaines sessions
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid md:grid-cols-2 gap-3">
                    {myEnrolledSessions.map((s) => {
                      const blur = shouldBlur(s); // devrait être false ici
                      const when = new Date(s.scheduled_at);
                      const own = isOwnSession(s, currentUser?.id);
                      return (
                        <div key={s.id} className="p-4 rounded-lg border bg-white/70">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center justify-center w-2 h-2 rounded-full bg-amber-500" />
                                <h4 className="font-semibold text-sm text-gray-900">{s.title}</h4>
                                <Badge className="bg-amber-100 text-amber-800">Inscrit</Badge>
                                {own && <Badge variant="secondary">Hôte</Badge>}
                              </div>
                              <div className="text-xs text-gray-600 mt-1">
                                {when.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })} · {when.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                              </div>
                              <div className="text-xs text-gray-600 mt-1">
                                <MapPin className="inline w-3 h-3 mr-1" />
                                {blur ? "Zone approximative" : (s.location_hint || "Lieu exact")}
                              </div>
                            </div>
                            <div className="flex flex-col gap-2">
                              {(() => {
                                const now = Date.now();
                                const sessionTime = new Date(s.scheduled_at).getTime();
                                const minutesUntil = (sessionTime - now) / 60000;
                                const canUnenroll = minutesUntil >= 30;
                                const showTrash = own && (s.participants_count ?? 1) === 1;

                                return canUnenroll ? (
                                  <Button
                                    size="sm"
                                    variant={showTrash ? "destructive" : "destructive"}
                                    onClick={async () => {
                                      const question = showTrash
                                        ? "Vous êtes l’hôte et le seul participant. Supprimer cette session ?"
                                        : "Voulez-vous vraiment vous désinscrire de cette session ?";
                                      if (!confirm(question)) return;

                                      try {
                                        const { data, error } = await supabase
                                          .rpc('leave_or_delete_session', { p_session_id: s.id });

                                        if (error) throw error;

                                        // Rafraîchir les données locales
                                        await Promise.all([fetchMyEnrollments(), fetchSessions()]);
                                      } catch (e: any) {
                                        alert("Erreur lors de l’action: " + e.message);
                                      }
                                    }}
                                  >
                                    {showTrash ? (
                                      // Icône corbeille + libellé
                                      <>
                                        {/* Pas d'import d'icône supplémentaire pour ne pas modifier la ligne d'import existante */}
                                        🗑️ Supprimer
                                      </>
                                    ) : (
                                      "Se désinscrire"
                                    )}
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled
                                    title="Désinscription impossible moins de 30 minutes avant le début"
                                  >
                                    {own && (s.participants_count ?? 1) === 1 ? "Supprimer" : "Se désinscrire"}
                                  </Button>
                                );
                              })()}
                              <Button size="sm" onClick={() => navigate(`/session/${s.id}`)}>Voir</Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* (SUPPRIMÉ) Légende icônes obsolète */}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Colonne gauche */}
          <div className="lg:col-span-1 order-2 lg:order-1 space-y-6">
            <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm order-2 lg:order-1">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Navigation className="w-5 h-5 text-green-600" />
                  Sessions près de vous
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">{[1,2,3].map(i => (<div key={i} className="animate-pulse bg-gray-200 h-20 rounded-lg"></div>))}</div>
                ) : filteredNearestSessions.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <MapPin className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">Aucune session proche trouvée</p>
                    <p className="text-xs mt-1">{filterRadius !== "all" || filterIntensity !== "all" || filterSessionType !== "all" ? "Essayez d'élargir vos filtres" : "Activez la géolocalisation"}</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {filteredNearestSessions.map(session => {
                      const blur = shouldBlur(session);
                      const { label: tLabel, badgeVariant, renderIcon } = getTypeMeta(session.session_type);
                      const enrolled = isEnrolledIn(session.id);
                      const own = isOwnSession(session, currentUser?.id);
                      return (
                        <div
                          key={session.id}
                          className={`p-4 rounded-lg border cursor-pointer transition-all hover:shadow-md ${selectedSession === session.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                          onClick={() => {
                            setSelectedSession(selectedSession === session.id ? null : session.id);
                            setCenter({ lat: session.start_lat, lng: session.start_lng });
                          }}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="font-semibold text-gray-900 text-sm line-clamp-1">
                              {session.title}
                            </h3>
                            <div className="flex items-center gap-2">
                              {enrolled && <Badge className="bg-amber-100 text-amber-800 h-5">Inscrit</Badge>}
                              {own && <Badge variant="secondary" className="h-5">Hôte</Badge>}
                              {session.distanceFromUser !== null && (<Badge variant="secondary" className="text-xs">{Number(session.distanceFromUser).toFixed(1)} km</Badge>)}
                            </div>
                          </div>

                          <div className="space-y-1 text-xs text-gray-600">
                            <div className="flex items-center gap-1">
  <Calendar className="w-3 h-3 text-blue-600" />
  <span className="inline-flex items-center rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 text-[11px] font-semibold">
    {new Date(session.scheduled_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
  </span>
</div>
                            <div className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {blur ? `Zone approximative (${session.blur_radius_m || 1000}m)` : (session.location_hint || 'Lieu exact')}
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 flex-wrap">
                                {session.intensity && (
                                  <Badge variant="outline" className="text-xs py-0">
                                    <Zap className="w-2 h-2 mr-1" />
                                    {dbToUiIntensity(session.intensity)}
                                  </Badge>
                                )}
                                {session.session_type && (
                                  <Badge variant={badgeVariant} className="text-xs py-0">
                                    {renderIcon("text-[11px] leading-none")}
                                    {tLabel}
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

            <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm order-3 lg:order-2">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Filter className="w-5 h-5 text-blue-600" />
                  Filtres
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Rayon de recherche</label>
                  <Select value={filterRadius} onValueChange={setFilterRadius}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
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
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Intensité</label>
                  <Select value={filterIntensity} onValueChange={setFilterIntensity}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Toutes les intensités</SelectItem>
                      <SelectItem value="marche">Marche</SelectItem>
                      <SelectItem value="course modérée">Course modérée</SelectItem>
                      <SelectItem value="course intensive">Course intensive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Type de session</label>
                  <Select value={filterSessionType} onValueChange={setFilterSessionType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
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
          </div>
        </div>

        {/* États */}
        {loading && (
          <div className="fixed bottom-4 right-4 bg-white shadow-lg rounded-lg p-4 flex items-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
            <span className="text-sm font-medium">Chargement des sessions...</span>
          </div>
        )}

        {error && (
          <div className="fixed bottom-4 right-4 bg-red-50 border border-red-200 shadow-lg rounded-lg p-4 max-w-sm">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center"><span className="text-white text-xs">!</span></div>
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
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Aucune session trouvée</h3>
              <p className="text-gray-500 mb-6">{filterRadius !== "all" || filterIntensity !== "all" || filterSessionType !== "all" ? "Essayez d'élargir vos filtres de recherche" : "Il n'y a pas de sessions disponibles pour le moment"}</p>
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
                <Button onClick={() => navigate("/create")}>Créer une session</Button>
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
