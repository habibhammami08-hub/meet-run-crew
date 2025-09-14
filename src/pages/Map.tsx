// src/pages/Map.tsx
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
import {
  MapPin,
  Users,
  Filter,
  RefreshCw,
  Navigation,
  Calendar,
  Zap,
} from "lucide-react";

type LatLng = { lat: number; lng: number };
type SessionRow = {
  id: string;
  title: string;
  scheduled_at: string;
  start_lat: number;
  start_lng: number;
  end_lat: number | null;
  end_lng: number | null;
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
  distanceFromUser?: number | null;
};

function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Brouillage déterministe
function seededNoise(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = ((h >>> 0) % 10000) / 10000;
  const v = (((h * 48271) >>> 0) % 10000) / 10000;
  return { u, v };
}

function jitterDeterministic(
  lat: number,
  lng: number,
  meters: number,
  seed: string
): LatLng {
  const r = meters / 111320;
  const { u, v } = seededNoise(seed);
  const w = r * Math.sqrt(u),
    t = 2 * Math.PI * v;
  return { lat: lat + w * Math.cos(t), lng: lng + w * Math.sin(t) };
}

function MapPageInner() {
  const navigate = useNavigate();
  const supabase = getSupabase();

  const { user: currentUser, hasActiveSubscription: hasSub, loading: authLoading } =
    useAuth();

  const [center, setCenter] = useState<LatLng>({ lat: 48.8566, lng: 2.3522 });
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [filterRadius, setFilterRadius] = useState<string>("all");
  const [filterIntensity, setFilterIntensity] = useState<string>("all");
  const [filterSessionType, setFilterSessionType] = useState<string>("all");

  // Refs
  const mountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const uiToDbIntensity = (uiIntensity: string): string | null => {
    const mapping: Record<string, string> = {
      marche: "low",
      "course modérée": "medium",
      "course intensive": "high",
    };
    return mapping[uiIntensity] || null;
  };

  const createCustomMarkerIcon = (
    isOwnSession: boolean,
    isSubscribed: boolean,
    isSelected: boolean = false
  ) => {
    const size = isOwnSession ? 20 : isSelected ? 18 : 14;
    const color = isOwnSession
      ? "#dc2626"
      : isSelected
      ? "#3b82f6"
      : isSubscribed
      ? "#065f46"
      : "#047857";

    const svg = `<svg width="${size}" height="${size + 6}" xmlns="http://www.w3.org/2000/svg">
      <path d="M${size / 2} ${size + 6} L${size / 2 - 4} ${size - 2} Q${
      size / 2
    } ${size - 6} ${size / 2 + 4} ${size - 2} Z" fill="${color}"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${
      size / 2 - 2
    }" fill="${color}" stroke="white" stroke-width="2"/>
      ${isOwnSession ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 4}" fill="white"/>` : ""}
      ${isSelected ? `<circle cx="${size / 2}" cy="${size / 2}" r="2" fill="white"/>` : ""}
    </svg>`;

    if (typeof window !== "undefined" && (window as any).google) {
      return {
        url: "data:image/svg+xml," + encodeURIComponent(svg),
        scaledSize: new (window as any).google.maps.Size(size, size + 6),
        anchor: new (window as any).google.maps.Point(size / 2, size + 6),
      };
    }
    return { url: "data:image/svg+xml," + encodeURIComponent(svg) };
  };

  // Geoloc
  useEffect(() => {
    if (!navigator.geolocation || !mountedRef.current) return;
    const successCallback = (position: GeolocationPosition) => {
      if (!mountedRef.current) return;
      const userPos = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      setCenter(userPos);
      setUserLocation(userPos);
    };
    const errorCallback = (error: GeolocationPositionError) => {
      if (!mountedRef.current) return;
      console.warn("[map] Geolocation error:", error);
    };
    navigator.geolocation.getCurrentPosition(successCallback, errorCallback, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 300000,
    });
  }, []);

  const fetchSessions = useCallback(async () => {
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
        .select(
          "id,title,scheduled_at,start_lat,start_lng,end_lat,end_lng,distance_km,route_polyline,intensity,session_type,blur_radius_m,host_id,location_hint,max_participants"
        )
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
        distanceFromUser: userLocation
          ? calculateDistance(
              userLocation.lat,
              userLocation.lng,
              s.start_lat,
              s.start_lng
            )
          : null,
      }));

      if (!signal.aborted && mountedRef.current) {
        setSessions(mapped);
      }
    } catch (e: any) {
      if (e.name !== "AbortError" && mountedRef.current) {
        setError(`Une erreur est survenue: ${e.message}`);
      }
    } finally {
      if (!signal.aborted && mountedRef.current) {
        setLoading(false);
      }
    }
  }, [supabase, userLocation]);

  const debouncedRefresh = useCallback(() => {
    if (!mountedRef.current) return;
    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
    debounceTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current) fetchSessions();
    }, 2000);
  }, [fetchSessions]);

  const filteredSessions = useMemo(() => {
    let filtered = sessions;

    if (userLocation && filterRadius !== "all") {
      const radius = parseInt(filterRadius, 10);
      filtered = filtered.filter(
        (s) => s.distanceFromUser !== null && (s.distanceFromUser as number) <= radius
      );
    }

    if (filterIntensity !== "all") {
      const dbIntensity = uiToDbIntensity(filterIntensity);
      if (dbIntensity) {
        filtered = filtered.filter((s) => s.intensity === dbIntensity);
      }
    }

    if (filterSessionType !== "all") {
      filtered = filtered.filter((s) => s.session_type === filterSessionType);
    }

    return filtered;
  }, [sessions, userLocation, filterRadius, filterIntensity, filterSessionType]);

  const filteredNearestSessions = useMemo(() => {
    return filteredSessions
      .filter((s) => s.distanceFromUser !== null && (s.distanceFromUser as number) <= 25)
      .sort((a, b) => (a.distanceFromUser || 0) - (b.distanceFromUser || 0))
      .slice(0, 6);
  }, [filteredSessions]);

  useEffect(() => {
    if (mountedRef.current) fetchSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation]);

  useEffect(() => {
    if (!authLoading && currentUser && mountedRef.current) {
      fetchSessions();
    }
  }, [authLoading, currentUser, hasSub, fetchSessions]);

  useEffect(() => {
    if (!supabase || !mountedRef.current) return;

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const ch = supabase
      .channel(`sessions-map-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sessions" },
        () => {
          if (mountedRef.current) debouncedRefresh();
        }
      )
      .subscribe();

    channelRef.current = ch;

    return () => {
      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
      if (channelRef.current && supabase) supabase.removeChannel(channelRef.current);
    };
  }, [supabase, debouncedRefresh]);

  useEffect(() => {
    mountedRef.current = true;
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
  }, [supabase]);

  const mapContainerStyle = useMemo(
    () => ({
      width: "100%",
      height: "60vh",
      minHeight: "400px",
      borderRadius: "16px",
    }),
    []
  );

  const pathFromPolyline = (p?: string | null): LatLng[] => {
    if (!p) return [];
    try {
      return polyline.decode(p).map(([lat, lng]) => ({ lat, lng }));
    } catch {
      return [];
    }
  };

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
                <h1 className="text-xl font-bold text-gray-900">
                  Sessions disponibles
                </h1>
                {currentUser && (
                  <p className="text-sm text-gray-600">
                    Connecté{hasSub && " • Abonnement actif"}
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
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
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
          {/* Colonne gauche */}
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
                {/* Rayon */}
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    Rayon de recherche
                  </label>
                  <select
                    value={filterRadius}
                    onChange={(e) => setFilterRadius(e.target.value)}
                    className="w-full border rounded-md h-9 px-2"
                  >
                    <option value="all">Toutes les sessions</option>
                    <option value="5">5 km</option>
                    <option value="10">10 km</option>
                    <option value="25">25 km</option>
                    <option value="50">50 km</option>
                  </select>
                </div>
                {/* Intensité */}
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    Intensité
                  </label>
                  <select
                    value={filterIntensity}
                    onChange={(e) => setFilterIntensity(e.target.value)}
                    className="w-full border rounded-md h-9 px-2"
                  >
                    <option value="all">Toutes les intensités</option>
                    <option value="marche">Marche</option>
                    <option value="course modérée">Course modérée</option>
                    <option value="course intensive">Course intensive</option>
                  </select>
                </div>
                {/* Type */}
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    Type de session
                  </label>
                  <select
                    value={filterSessionType}
                    onChange={(e) => setFilterSessionType(e.target.value)}
                    className="w-full border rounded-md h-9 px-2"
                  >
                    <option value="all">Tous types</option>
                    <option value="mixed">Mixte</option>
                    <option value="women
