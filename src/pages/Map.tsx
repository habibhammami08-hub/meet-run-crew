import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { GoogleMap, Polyline, MarkerF } from "@react-google-maps/api";
import { Link, useNavigate } from "react-router-dom";
import { getSupabase } from "@/integrations/supabase/client";
import polyline from "@mapbox/polyline";
import { dbToUiIntensity } from "@/lib/sessions/intensity";
import { useAuth } from "@/hooks/useAuth";
import { MapErrorBoundary } from "@/components/MapErrorBoundary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Users, ChevronDown, SlidersHorizontal, Navigation, Calendar, Zap, User, ArrowRight, Route, Plus, Building2 } from "lucide-react"; // Filter remplacé par ChevronDown/SlidersHorizontal (nouvelle fenêtre de filtres)
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar as CalendarDays } from "@/components/ui/calendar";
import { fr } from "date-fns/locale";
import { addDays, startOfWeek, format } from "date-fns";
import { cn } from "@/lib/utils";
import markImage from "@/assets/meetrun-mark.png"; // Marque MeetRun (fond transparent)

import { useGeolocationNotifications } from "@/hooks/useGeolocationNotifications";
import { isFreePromoActive } from "@/config/promo";


// Auth route (adjust if your auth page differs)

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

// Filet d'accent + pastille couleur selon le type de session : repère visuel immédiat
// vert = mixte, rouge = femmes uniquement, bleu = hommes uniquement
const typeAccent = (type: SessionRow["session_type"]) => {
  if (type === "women_only") {
    return { rail: "from-rose-300 via-rose-500 to-red-600", dot: "bg-rose-500" };
  }
  if (type === "men_only") {
    return { rail: "from-sky-300 via-blue-500 to-indigo-600", dot: "bg-blue-500" };
  }
  return { rail: "from-emerald-300 via-emerald-500 to-green-600", dot: "bg-emerald-500" };
};

// ——— Fenêtre de filtres : pastilles segmentées (pas de listes déroulantes)
type FilterOptionDef = { value: string; label: string; dot?: string };

function FilterChip({ option, selected, onSelect }: { option: FilterOptionDef; selected: boolean; onSelect: (v: string) => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(option.value)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold transition-all duration-200 active:scale-[0.97]",
        selected
          ? "bg-foreground text-background shadow-[0_8px_20px_-10px_hsl(210_40%_8%/0.7)]"
          : "bg-muted/70 text-muted-foreground ring-1 ring-inset ring-border hover:bg-muted hover:text-foreground"
      )}
    >
      {option.dot && <span className={cn("h-2 w-2 shrink-0 rounded-full", option.dot)} />}
      {option.label}
    </button>
  );
}

function FilterGroup({ title, options, value, onChange }: { title: string; options: FilterOptionDef[]; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <FilterChip key={o.value} option={o} selected={value === o.value} onSelect={onChange} />
        ))}
      </div>
    </div>
  );
}

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
// Icônes de carte
// Départ : épingle moderne colorée selon le type de session
// (vert = mixte, rouge = femmes uniquement, bleu = hommes uniquement)
// Arrivée : petit point rouge — Position : petit point bleu
// ————————————————————————————————————————————

const DOT_SIZE = 12; // taille uniforme pour les petits points

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

const END_DOT_COLOR   = "#ef4444";  // rouge
const USER_DOT_COLOR  = "#3b82f6";  // bleu

// ————————————————————————————————————————————
// Épingles de départ (type de session)
// ————————————————————————————————————————————

const PIN_W = 34;
const PIN_H = 46;
const PIN_TIP_Y = 42.5;

// Pictogrammes dessinés en blanc sur l'épingle
const GLYPH_WOMEN = `<g fill="none" stroke="#ffffff" stroke-width="2.3" stroke-linecap="round"><circle cx="17" cy="11.8" r="3.7"/><path d="M17 15.5v5.4M14.2 18.4h5.6"/></g>`;
const GLYPH_MEN = `<g fill="none" stroke="#ffffff" stroke-width="2.3" stroke-linecap="round"><circle cx="15.6" cy="13.6" r="3.7"/><path d="M18.4 10.8l4.6-4.6M23 6.2h-4.4M23 6.2v4.4"/></g>`;
const GLYPH_MIXED = `<g fill="#ffffff"><circle cx="13.6" cy="11.2" r="2.6"/><circle cx="20.4" cy="11.2" r="2.6"/></g><g fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round"><path d="M10.4 19.8c0-2.2 1.4-3.9 3.2-3.9s3.2 1.7 3.2 3.9"/><path d="M17.2 19.8c0-2.2 1.4-3.9 3.2-3.9s3.2 1.7 3.2 3.9"/></g>`;

const pinTheme = (type: SessionRow["session_type"]) => {
  if (type === "women_only") return { from: "#fb7185", to: "#dc2626", glyph: GLYPH_WOMEN };
  if (type === "men_only") return { from: "#38bdf8", to: "#4f46e5", glyph: GLYPH_MEN };
  return { from: "#34d399", to: "#059669", glyph: GLYPH_MIXED };
};

const buildPinSvg = (type: SessionRow["session_type"], selected: boolean) => {
  const { from, to, glyph } = pinTheme(type);
  return `<svg width="${PIN_W}" height="${PIN_H}" viewBox="0 0 ${PIN_W} ${PIN_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="body" x1="0.1" y1="0" x2="0.9" y2="1">
      <stop offset="0" stop-color="${from}"/>
      <stop offset="1" stop-color="${to}"/>
    </linearGradient>
    <radialGradient id="shadow">
      <stop offset="0" stop-color="#0f172a" stop-opacity="0.28"/>
      <stop offset="1" stop-color="#0f172a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <ellipse cx="17" cy="43.6" rx="8" ry="2.8" fill="url(#shadow)"/>
  ${selected ? `<circle cx="17" cy="15.2" r="15.4" fill="none" stroke="#ffffff" stroke-width="2.4" opacity="0.95"/>` : ""}
  <path d="M17 ${PIN_TIP_Y}C11 33 3.6 24.6 3.6 15.2A13.4 13.4 0 1 1 30.4 15.2C30.4 24.6 23 33 17 ${PIN_TIP_Y}Z" fill="url(#body)" stroke="#ffffff" stroke-width="2.4" stroke-linejoin="round"/>
  <circle cx="11.8" cy="9.2" r="2.6" fill="#ffffff" opacity="0.25"/>
  ${glyph}
</svg>`;
};

const pinIconCache = new Map<string, any>();

function createStartPinIcon(type: SessionRow["session_type"], selected = false) {
  const key = `${type}|${selected ? 1 : 0}`;
  const cached = pinIconCache.get(key);
  if (cached) return cached;

  const url = "data:image/svg+xml," + encodeURIComponent(buildPinSvg(type, selected));
  const g = typeof window !== "undefined" ? (window as any).google : undefined;
  const icon = g?.maps?.Size && g?.maps?.Point
    ? { url, scaledSize: new g.maps.Size(PIN_W, PIN_H), anchor: new g.maps.Point(PIN_W / 2, PIN_TIP_Y) }
    : { url };

  pinIconCache.set(key, icon);
  return icon;
}

// ————————————————————————————————————————————
// Pictogrammes de type 
// ————————————————————————————————————————————

type TypeMeta = {
  label: string;
  badgeVariant: "outline" | "secondary";
  badgeClass: string;
  renderIcon: (className?: string) => JSX.Element;
};

function getTypeMeta(t: SessionRow["session_type"]): TypeMeta {
  if (t === "women_only") {
    return {
      label: "Femmes uniquement",
      badgeVariant: "secondary",
      badgeClass: "border-transparent bg-gradient-to-r from-rose-400 via-rose-500 to-red-600 text-white",
      renderIcon: (cls = "") => <span className={`mr-1 ${cls}`} aria-hidden>♀</span>,
    };
  }
  if (t === "men_only") {
    return {
      label: "Hommes uniquement",
      badgeVariant: "secondary",
      badgeClass: "border-transparent bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-600 text-white",
      renderIcon: (cls = "") => <span className={`mr-1 ${cls}`} aria-hidden>♂</span>,
    };
  }
  // mixed par défaut — même couleur que le filet latéral (vert)
  return {
    label: "Mixte",
    badgeVariant: "secondary",
    badgeClass: "border-transparent bg-gradient-to-r from-emerald-400 via-emerald-500 to-green-600 text-white",
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
  const [showFilters, setShowFilters] = useState(false);
  const activeFilterCount = [filterRadius, filterIntensity, filterSessionType].filter((v) => v !== "all").length;
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

  // Arrondissement / quartier de départ (géocodage inversé, mis en cache par session)
  const [arrondissements, setArrondissements] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    const pending = sessions.filter((s) => !arrondissements[s.id] && s.start_lat != null && s.start_lng != null).slice(0, 30);
    pending.forEach(async (s) => {
      const cacheKey = `meetrun_arr_${s.start_lat.toFixed(4)}_${s.start_lng.toFixed(4)}`;
      let label: string | null = localStorage.getItem(cacheKey);
      if (!label) {
        try {
          const { data, error } = await getSupabase().functions.invoke("google-maps-services", {
            body: { action: "reverse_geocode", lat: s.start_lat, lng: s.start_lng },
          });
          if (error || !data?.results?.length) return;
          const all = (data.results as any[]).flatMap((r) => r.address_components ?? []);
          const postal = all.find((c) => c.types.includes("postal_code"))?.long_name as string | undefined;
          const locality = all.find((c) => c.types.includes("locality"))?.long_name as string | undefined;
          const sub = all.find((c) => c.types.includes("sublocality_level_1") || c.types.includes("sublocality"))?.long_name as string | undefined;
          const subNum = sub?.match(/(\d+)/)?.[1];
          if (postal && /^75\d{3}$/.test(postal)) label = `Paris ${parseInt(postal.slice(3), 10)}e`;
          else if (postal && /^69\d{3}$/.test(postal) && locality === "Lyon") label = `Lyon ${parseInt(postal.slice(3), 10)}e`;
          else if (postal && /^13\d{3}$/.test(postal) && locality === "Marseille") label = `Marseille ${parseInt(postal.slice(3), 10)}e`;
          else if (sub && subNum) label = `${locality ?? ""} ${subNum}e`.trim();
          else label = sub || locality || null;
          if (label) localStorage.setItem(cacheKey, label);
        } catch { return; }
      }
      if (label && !cancelled) setArrondissements((prev) => (prev[s.id] ? prev : { ...prev, [s.id]: label! }));
    });
    return () => { cancelled = true; };
  }, [sessions]);

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

    // ▼▼▼ Mise à jour : règle d’affichage (31/15 min) selon nb d'inscrits HORS hôte
    // - Si participants_count === 0  -> retirer 31 minutes avant le début (hôte seul)
    // - Si participants_count >= 1   -> retirer 15 minutes avant le début
    const now = Date.now();
    filtered = filtered.filter(s => {
      const minutesUntil = (new Date(s.scheduled_at).getTime() - now) / 60000;
      const count = (s.participants_count ?? 0); // fallback = 0 (hôte seul)

      if (count === 0) return minutesUntil >= 31;
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-deep/5 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-md border-b border-gray-200/50 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link
              to="/"
              aria-label="MeetRun — accueil"
              className="flex shrink-0 items-center"
            >
              <img
                src={markImage}
                alt="MeetRun"
                className="h-9 w-auto sm:h-10"
              />
            </Link>

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

              {/* ▼▼▼ Version PC : icône Profil (connecté) — bouton Se connecter supprimé */}
              {currentUser && (
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

              {/* Bouton Créer une session (remplace le bouton Unlimited offert / S'abonner) */}
              <Button
                size="sm"
                onClick={() => navigate("/create")}
                className="rounded-full shadow-sm bg-deep text-deep-foreground hover:bg-deep/90 hover:text-deep-foreground"
                aria-label="Créer une session"
              >
                <Plus className="w-4 h-4" />
                Créer une session
              </Button>

              {/* ▼ Version Mobile : icône Profil (connecté) — bouton Se connecter supprimé */}
              {currentUser && (
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
                          {/* Départ — épingle colorée selon le type de session */}
                          <MarkerF
                            position={startShown}
                            title={`${s.title} • ${dbToUiIntensity(s.intensity || undefined)}${own ? ' (Votre session)' : enrolled ? ' (Inscrit)' : ''}`}
                            icon={createStartPinIcon(s.session_type, selected)}
                            zIndex={selected ? 9999 : undefined}
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
                    const { label: typeLabel, badgeVariant, badgeClass, renderIcon } = getTypeMeta(session.session_type);
                    const enrolled = isEnrolledIn(session.id);
                    const own = isOwnSession(session, currentUser?.id);
                    const scheduled = new Date(session.scheduled_at);

                    return (
                      <div className="min-w-0 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="min-w-0 truncate text-lg font-bold tracking-tight text-gray-900">{session.title}</h3>
                          <Button
                            size="sm"
                            onClick={() => navigate(`/session/${session.id}`)}
                            className="h-8 shrink-0 gap-1 rounded-full px-3 text-xs font-bold"
                          >
                            <span className="hidden sm:inline">Voir détails</span>
                            <span className="sm:hidden">Voir</span>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Button>
                        </div>

                        {session.description && (
                          <p className="line-clamp-2 text-sm text-gray-600">{session.description}</p>
                        )}

                        {/* Une information par ligne, sans retour à la ligne */}
                        <div className="space-y-1.5 text-sm text-gray-600">
                          <div className="flex min-w-0 items-center gap-2">
                            <Calendar className="h-4 w-4 shrink-0 text-blue-600" />
                            <span className="min-w-0 truncate whitespace-nowrap font-semibold text-blue-700">
                              {scheduled.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
                              {" · "}
                              {scheduled.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          <div className="flex min-w-0 items-center gap-2">
                            <Building2 className="h-4 w-4 shrink-0 text-gray-400" />
                            <span className="min-w-0 truncate whitespace-nowrap">
                              {arrondissements[session.id] || "Ville en cours de chargement"}
                            </span>
                          </div>
                          {!blur && (
                            <div className="flex min-w-0 items-center gap-2">
                              <MapPin className="h-4 w-4 shrink-0 text-gray-400" />
                              <span className="min-w-0 truncate whitespace-nowrap">{session.location_hint || "Lieu exact"}</span>
                            </div>
                          )}
                          {session.distanceFromUser !== null && (
                            <div className="flex min-w-0 items-center gap-2">
                              <Navigation className="h-4 w-4 shrink-0 text-gray-400" />
                              <span className="min-w-0 truncate whitespace-nowrap">
                                À {Number(session.distanceFromUser).toFixed(1)} km de vous
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Intensité, distance, type, participants : tous sur la même ligne */}
                        <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                          {enrolled && (
                            <Badge className="h-6 shrink-0 whitespace-nowrap bg-amber-100 px-2 text-[11px] text-amber-800">Inscrit</Badge>
                          )}
                          {own && (
                            <Badge variant="secondary" className="h-6 shrink-0 whitespace-nowrap px-2 text-[11px]">Hôte</Badge>
                          )}
                          {session.intensity && (
                            <Badge variant="outline" className="h-6 shrink-0 gap-1 whitespace-nowrap border-gray-200 px-2 text-[11px] font-medium">
                              <Zap className="h-2.5 w-2.5 text-gray-400" />
                              {dbToUiIntensity(session.intensity)}
                            </Badge>
                          )}
                          {session.distance_km && (
                            <span className="inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap text-[11px] font-medium text-gray-500">
                              <Route className="h-3 w-3 text-gray-400" />
                              <span className="tabular-nums">{session.distance_km} km</span>
                            </span>
                          )}
                          {session.session_type && (
                            <Badge variant={badgeVariant} className={cn("h-6 shrink-0 whitespace-nowrap px-2 text-[11px] font-medium", badgeClass)}>
                              {renderIcon("text-[11px] leading-none")}
                              {typeLabel}
                            </Badge>
                          )}
                          {session.max_participants && (
                            <span className="inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap text-[11px] font-medium text-gray-500">
                              <Users className="h-3 w-3 text-gray-400" />
                              <span className="tabular-nums">{(session.participants_count ?? 0) + 1}/{session.max_participants}</span>
                            </span>
                          )}
                        </div>
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
                                {blur ? (arrondissements[s.id] || "Zone approximative") : (s.location_hint || "Lieu exact")}
                              </div>
                            </div>
                            <div className="flex flex-col gap-2">
                              {(() => {
                                const now = Date.now();
                                const sessionTime = new Date(s.scheduled_at).getTime();
                                const minutesUntil = (sessionTime - now) / 60000;
                                const canUnenroll = minutesUntil >= 30;
                                const showTrash = own && (s.participants_count ?? 0) === 0; // ← corrigé

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
                                      <>
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
                                    {own && (s.participants_count ?? 0) === 0 ? "Supprimer" : "Se désinscrire"}
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
            <Card className="order-2 overflow-hidden border-0 bg-white/80 shadow-lg backdrop-blur-sm lg:order-1">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2.5 text-lg">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/15">
                      <Navigation className="h-4 w-4 text-primary" />
                    </span>
                    Sessions près de vous
                  </CardTitle>
                  {!loading && filteredNearestSessions.length > 0 && (
                    <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold tabular-nums text-primary ring-1 ring-primary/15">
                      {filteredNearestSessions.length}
                    </span>
                  )}
                </div>
                {/* Accès filtres : le mot « Filtre » démarre sous « Sessions » (icône 32px + écart 10px) */}
                <div className="mt-3 flex pl-[42px]">
                  <button
                    type="button"
                    onClick={() => setShowFilters(true)}
                    className="-ml-2.5 inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
                  >
                    <span>Filtre</span>
                    <ChevronDown className="h-3.5 w-3.5" />
                    {activeFilterCount > 0 && (
                      <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-bold tabular-nums text-background">
                        {activeFilterCount}
                      </span>
                    )}
                  </button>
                </div>

              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="animate-pulse rounded-2xl bg-gray-100/80 p-4 ring-1 ring-gray-900/5">
                        <div className="h-3.5 w-1/2 rounded-full bg-gray-200" />
                        <div className="mt-3 h-3 w-3/4 rounded-full bg-gray-200/70" />
                        <div className="mt-2 h-3 w-1/3 rounded-full bg-gray-200/50" />
                      </div>
                    ))}
                  </div>
                ) : filteredNearestSessions.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/70 px-4 py-8 text-center">
                    <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-900/5">
                      <MapPin className="h-6 w-6 text-gray-400" />
                    </span>
                    <p className="text-sm font-semibold text-gray-800">Aucune session proche trouvée</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {filterRadius !== "all" || filterIntensity !== "all" || filterSessionType !== "all"
                        ? "Essayez d'élargir vos filtres"
                        : "Activez la géolocalisation"}
                    </p>
                  </div>
                ) : (
                  <div className="thin-scroll max-h-96 space-y-3 overflow-y-auto pr-1">
                    {filteredNearestSessions.map(session => {
                      const blur = shouldBlur(session);
                      const { label: tLabel, badgeVariant, badgeClass, renderIcon } = getTypeMeta(session.session_type);
                      const enrolled = isEnrolledIn(session.id);
                      const own = isOwnSession(session, currentUser?.id);
                      const accent = typeAccent(session.session_type);
                      const isSelected = selectedSession === session.id;
                      const scheduled = new Date(session.scheduled_at);
                      return (
                        <div
                          key={session.id}
                          onClick={() => {
                            navigate(`/session/${session.id}`);
                          }}
                          className={cn(
                            "group relative cursor-pointer overflow-hidden rounded-2xl bg-white py-4 pl-6 pr-4 transition-all duration-200",
                            "shadow-[var(--shadow-card)] ring-1 ring-gray-900/5",
                            "hover:-translate-y-0.5 hover:shadow-[var(--shadow-hover)] hover:ring-primary/25",
                            "active:translate-y-0 active:scale-[0.99]",
                            isSelected && "ring-2 ring-primary/70"
                          )}
                        >
                          {/* Filet d'accent couleur type de session */}
                          <span
                            aria-hidden
                            className={cn(
                              "absolute left-3 top-3 bottom-3 w-1 rounded-full bg-gradient-to-b opacity-80 transition-all duration-200",
                              "group-hover:w-1.5 group-hover:opacity-100",
                              accent.rail,
                              isSelected && "w-1.5 opacity-100"
                            )}
                          />

                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className={cn("h-2 w-2 shrink-0 rounded-full", accent.dot)} />
                                <h3 className="truncate text-sm font-bold tracking-tight text-gray-900">
                                  {session.title}
                                </h3>
                              </div>
                              {(enrolled || own) && (
                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                  {enrolled && <Badge className="h-5 bg-amber-100 text-[10px] text-amber-800">Inscrit</Badge>}
                                  {own && <Badge variant="secondary" className="h-5 text-[10px]">Hôte</Badge>}
                                </div>
                              )}
                            </div>
                            {/* Bouton « Voir » en haut à droite, fond vert profond #0d4239 */}
                            <Button
                              size="sm"
                              className="h-7 shrink-0 gap-1 rounded-full px-3 text-xs font-bold"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/session/${session.id}`);
                              }}
                            >
                              Voir
                              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                            </Button>
                          </div>


                          <div className="mt-3 space-y-2">
                            <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-100">
                              <Calendar className="h-3 w-3" />
                              {scheduled.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
                              {" · "}
                              {scheduled.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            <div className="flex items-center gap-1.5 text-xs text-gray-500">
                              <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                              <span className="truncate">
                                {blur ? (arrondissements[session.id] || "Zone approximative") : (session.location_hint || "Lieu exact")}
                              </span>
                            </div>
                          </div>

                          <div className="mt-3 -ml-6 -mr-4 flex items-center gap-2 border-t border-gray-100 pl-6 pr-4 pt-3">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {session.intensity && (
                                <Badge variant="outline" className="h-6 gap-1 border-gray-200 text-[11px] font-medium">
                                  <Zap className="h-2.5 w-2.5 text-gray-400" />
                                  {dbToUiIntensity(session.intensity)}
                                </Badge>
                              )}
                              {session.session_type && (
                                <Badge variant={badgeVariant} className={cn("h-6 text-[11px] font-medium", badgeClass)}>
                                  {renderIcon("text-[11px] leading-none")}
                                  {tLabel}
                                </Badge>
                              )}
                              {session.distance_km && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500">
                                  <Route className="h-3 w-3 text-gray-400" />
                                  <span className="tabular-nums">{session.distance_km} km</span>
                                </span>
                              )}
                              {session.max_participants && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500">
                                  <Users className="h-3 w-3 text-gray-400" />
                                  <span className="tabular-nums">{(session.participants_count ?? 0) + 1}/{session.max_participants}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Dialog open={showFilters} onOpenChange={setShowFilters}>
              <DialogContent
                className={cn(
                  // Feuille modale : posée en bas sur téléphone, carte centrée sur ordinateur
                  "fixed inset-x-0 bottom-0 top-auto left-0 right-0 z-50 grid w-full max-w-none translate-x-0 translate-y-0 gap-0",
                  "rounded-t-[28px] rounded-b-none border-0 bg-background p-0 shadow-[0_-24px_70px_-24px_hsl(210_40%_8%/0.45)]",
                  "data-[state=open]:slide-in-from-left-0 data-[state=closed]:slide-out-to-left-0",
                  "data-[state=open]:slide-in-from-top-0 data-[state=closed]:slide-out-to-top-0",
                  "data-[state=open]:slide-in-from-bottom-[60%] data-[state=closed]:slide-out-to-bottom-[60%]",
                  "sm:inset-auto sm:bottom-auto sm:left-[50%] sm:top-[50%] sm:w-auto sm:max-w-md sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-[28px] sm:shadow-[0_30px_80px_-30px_hsl(210_40%_8%/0.45)]",
                  "sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=closed]:slide-out-to-bottom-0",
                  "sm:data-[state=open]:slide-in-from-top-[48%] sm:data-[state=closed]:slide-out-to-top-[48%]"
                )}
              >
                <div className="flex items-start gap-3 border-b border-border/70 px-5 pb-4 pt-6 sm:pt-6">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-foreground/[0.05] ring-1 ring-inset ring-border">
                    <SlidersHorizontal className="h-4 w-4 text-foreground" />
                  </span>
                  <DialogHeader className="min-w-0 text-left">
                    <DialogTitle className="text-[15px] font-bold tracking-tight">Affiner la recherche</DialogTitle>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {activeFilterCount === 0
                        ? "Aucun filtre actif"
                        : `${activeFilterCount} filtre${activeFilterCount > 1 ? "s" : ""} actif${activeFilterCount > 1 ? "s" : ""}`}
                    </p>
                  </DialogHeader>
                </div>

                <div className="thin-scroll max-h-[52vh] space-y-5 overflow-y-auto px-5 py-5 sm:max-h-[58vh]">
                  <FilterGroup
                    title="Rayon de recherche"
                    value={filterRadius}
                    onChange={setFilterRadius}
                    options={[
                      { value: "all", label: "Toutes distances" },
                      { value: "5", label: "5 km" },
                      { value: "10", label: "10 km" },
                      { value: "25", label: "25 km" },
                      { value: "50", label: "50 km" },
                    ]}
                  />
                  <FilterGroup
                    title="Intensité"
                    value={filterIntensity}
                    onChange={setFilterIntensity}
                    options={[
                      { value: "all", label: "Toutes" },
                      { value: "marche", label: "Marche" },
                      { value: "course modérée", label: "Modérée" },
                      { value: "course intensive", label: "Intensive" },
                    ]}
                  />
                  <FilterGroup
                    title="Type de session"
                    value={filterSessionType}
                    onChange={setFilterSessionType}
                    options={[
                      { value: "all", label: "Tous types" },
                      { value: "mixed", label: "Mixte", dot: typeAccent("mixed").dot },
                      { value: "women_only", label: "Femmes uniquement", dot: typeAccent("women_only").dot },
                      { value: "men_only", label: "Hommes uniquement", dot: typeAccent("men_only").dot },
                    ]}
                  />
                </div>

                <div className="flex items-center gap-2 border-t border-border/70 bg-muted/40 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:rounded-b-[28px]">
                  <Button
                    variant="ghost"
                    disabled={activeFilterCount === 0}
                    onClick={() => {
                      setFilterRadius("all");
                      setFilterIntensity("all");
                      setFilterSessionType("all");
                    }}
                    className="h-11 shrink-0 rounded-full px-4 text-sm font-semibold text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-40"
                  >
                    Réinitialiser
                  </Button>
                  <Button
                    onClick={() => setShowFilters(false)}
                    className="h-11 flex-1 rounded-full bg-foreground px-5 text-sm font-bold text-background shadow-[0_12px_26px_-14px_hsl(210_40%_8%/0.9)] hover:bg-foreground/90 hover:text-background sm:flex-none"
                  >
                    {filteredNearestSessions.length > 0
                      ? `Voir ${filteredNearestSessions.length} session${filteredNearestSessions.length > 1 ? "s" : ""}`
                      : "Voir les sessions"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

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
