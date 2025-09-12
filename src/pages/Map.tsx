// src/pages/Map.tsx - Corrections pour les fuites mémoire
import { useEffect, useMemo, useRef, useState } from "react";
import { GoogleMap, Polyline, MarkerF } from "@react-google-maps/api";
import { useNavigate } from "react-router-dom";
import { getSupabase } from "@/integrations/supabase/client";
import polyline from "@mapbox/polyline";
import { dbToUiIntensity } from "@/lib/sessions/intensity";
import { MapErrorBoundary } from "@/components/MapErrorBoundary";
import { MapPin } from "lucide-react";

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
};

// Brouillage déterministe et cohérent par session
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
  const [center, setCenter] = useState<LatLng>({ lat: 48.8566, lng: 2.3522 });  
  const [sessions, setSessions] = useState<SessionRow[]>([]);  
  const [hasSub, setHasSub] = useState<boolean>(false);  
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);  
  const [error, setError] = useState<string | null>(null);

  // CORRECTION: Refs pour gérer les cleanup et éviter les fuites mémoire
  const mountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const channelRef = useRef<any>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout>();
  const geolocationWatchRef = useRef<number | null>(null);

  // Icône différentiée pour ses propres sessions
  const createCustomMarkerIcon = (isOwnSession: boolean, isSubscribed: boolean) => {
    const size = isOwnSession ? 16 : 12;
    const color = isOwnSession ? '#dc2626' : (isSubscribed ? '#065f46' : '#047857');
    
    const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${size/2}" cy="${size/2}" r="${size/2-1}" fill="${color}" stroke="white" stroke-width="1"/>
      ${isOwnSession ? `<circle cx="${size/2}" cy="${size/2}" r="${size/4}" fill="white"/>` : ''}
    </svg>`;
    
    if (typeof window !== 'undefined' && window.google) {
      return {
        url: 'data:image/svg+xml,' + encodeURIComponent(svg),
        scaledSize: new window.google.maps.Size(size, size),
        anchor: new window.google.maps.Point(size/2, size/2),
      };
    } else {
      return {
        url: 'data:image/svg+xml,' + encodeURIComponent(svg),
      };
    }
  };

  // CORRECTION: Geolocalisation avec cleanup
  useEffect(() => {  
    if (!navigator.geolocation || !mountedRef.current) return;
    
    console.log("[map] Requesting user location...");
    
    const successCallback = (position: GeolocationPosition) => {
      if (!mountedRef.current) return;
      
      const userPos = { 
        lat: position.coords.latitude, 
        lng: position.coords.longitude 
      };
      console.log("[map] User location found:", userPos);
      setCenter(userPos);
    };
    
    const errorCallback = (error: GeolocationPositionError) => {
      if (!mountedRef.current) return;
      console.warn("[map] Geolocation error:", error);
    };
    
    // CORRECTION: Utiliser getCurrentPosition au lieu de watchPosition pour éviter les fuites
    navigator.geolocation.getCurrentPosition(
      successCallback,
      errorCallback,
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000
      }
    );
    
    return () => {
      // Cleanup geolocation si nécessaire
      if (geolocationWatchRef.current !== null) {
        navigator.geolocation.clearWatch(geolocationWatchRef.current);
      }
    };
  }, []);

  // CORRECTION: Fonction de fetch avec AbortController et cleanup strict
  const fetchGateAndSessions = async () => {  
    if (!supabase || !mountedRef.current) {
      console.log("[map] Fetch cancelled - component unmounted or no supabase");
      return;
    }
    
    // Annuler la requête précédente
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Créer un nouveau controller
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    
    setLoading(true);
    setError(null);
    console.log("[map] Fetching sessions...");
    
    try {  
      // Récupération utilisateur
      const { data: { user } } = await supabase.auth.getUser();  
      
      if (signal.aborted || !mountedRef.current) return;
      
      setCurrentUser(user);
      
      if (user) {  
        console.log("[map] User authenticated:", user.id);
        const { data: prof } = await supabase  
          .from("profiles")  
          .select("sub_status, sub_current_period_end")  
          .eq("id", user.id)  
          .maybeSingle();
          
        if (signal.aborted || !mountedRef.current) return;
        
        const active = prof?.sub_status && ["active","trialing"].includes(prof.sub_status)  
          && prof?.sub_current_period_end && new Date(prof.sub_current_period_end) > new Date();  
        setHasSub(!!active);  
        console.log("[map] Subscription active:", !!active);
      } else {  
        console.log("[map] No authenticated user");
        setHasSub(false);  
      }

      if (signal.aborted || !mountedRef.current) return;

      // Fenêtre de temps plus large pour inclure les sessions récentes
      const now = new Date();
      const cutoffDate = new Date(now.getTime() - 4 * 60 * 60 * 1000);
      
      console.log("[map] Fetching sessions from:", cutoffDate.toISOString());
      
      const { data, error } = await supabase  
        .from("sessions")  
        .select("id,title,scheduled_at,start_lat,start_lng,end_lat,end_lng,distance_km,route_polyline,intensity,session_type,blur_radius_m,host_id")
        .gte("scheduled_at", cutoffDate.toISOString())
        .eq("status", "published")
        .order("scheduled_at", { ascending: true })  
        .limit(500);

      if (signal.aborted || !mountedRef.current) return;

      if (error) {  
        console.error("[map] Fetch sessions error:", error);
        setError("Erreur lors du chargement des sessions. Veuillez réessayer.");
        throw error;  
      }

      console.log("[map] Raw sessions data:", data?.length || 0, "sessions");

      const mappedSessions = (data ?? []).map((s) => ({  
        ...s,  
        location_lat: s.start_lat,  
        location_lng: s.start_lng,  
      }));

      if (!signal.aborted && mountedRef.current) {
        console.log("[map] Mapped sessions:", mappedSessions.length, "sessions");
        setSessions(mappedSessions);
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        console.log("[map] Request aborted");
      } else {
        console.error("[map] Load error:", e);
        if (!signal.aborted && mountedRef.current) {
          setError("Une erreur inattendue est survenue lors du chargement des données.");
        }
      }
    } finally {  
      if (!signal.aborted && mountedRef.current) {
        setLoading(false);
      }
    }
  };

  // CORRECTION: Fonction de refresh avec debounce amélioré
  const debouncedRefresh = () => {
    if (!mountedRef.current) return;
    
    clearTimeout(debounceTimeoutRef.current);
    debounceTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current) {
        fetchGateAndSessions();
      }
    }, 2000);
  };

  // CORRECTION: Chargement initial avec cleanup
  useEffect(() => { 
    if (mountedRef.current) {
      fetchGateAndSessions(); 
    }
  }, []);

  // CORRECTION: Realtime avec cleanup strict et gestion d'erreur
  useEffect(() => {  
    if (!supabase || !mountedRef.current) return;  
    
    console.log("[map] Setting up realtime listener");
    
    // Nettoyer le channel précédent s'il existe
    if (channelRef.current) {
      console.log("[map] Cleaning up previous channel");
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    
    const ch = supabase.channel(`sessions-map-${Date.now()}`)  
      .on("postgres_changes", { 
        event: "*", 
        schema: "public", 
        table: "sessions" 
      }, (payload: any) => {  
        if (!mountedRef.current) return;
        console.log("[map] Realtime session update:", payload);
        debouncedRefresh();
      })  
      .subscribe((status) => {
        if (!mountedRef.current) return;
        console.log("[map] Realtime channel status:", status);
      });  
    
    channelRef.current = ch;
    
    return () => { 
      console.log("[map] Cleaning up realtime channel");
      clearTimeout(debounceTimeoutRef.current);
      
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      if (channelRef.current && supabase) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };  
  }, []);

  // CORRECTION: Cleanup général strict
  useEffect(() => {
    mountedRef.current = true;
    
    return () => {
      console.log("[map] Component unmounting - cleaning up all resources");
      mountedRef.current = false;
      
      // Cleanup timeout
      clearTimeout(debounceTimeoutRef.current);
      
      // Cleanup AbortController
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      
      // Cleanup geolocation
      if (geolocationWatchRef.current !== null) {
        navigator.geolocation.clearWatch(geolocationWatchRef.current);
        geolocationWatchRef.current = null;
      }
      
      // Cleanup realtime channel
      if (channelRef.current && supabase) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);

  const mapContainerStyle = useMemo(() => ({ 
    width: "100%", 
    height: "calc(100vh - 120px)",
    touchAction: "pan-x pan-y"
  }), []);

  const pathFromPolyline = (p?: string | null): LatLng[] => {  
    if (!p) return [];  
    try { return polyline.decode(p).map(([lat, lng]) => ({ lat, lng })); } catch { return []; }  
  };

  return (  
    <div className="w-full">  
      <div className="px-4 py-2 flex items-center justify-between">  
        <h1 className="text-xl font-semibold">Sessions autour de vous</h1>  
        {!hasSub && (  
          <div className="text-xs text-muted-foreground">  
            Coordonnées approximatives pour les non-abonnés • <a href="/subscription" className="underline">S'abonner</a>  
          </div>  
        )}  
      </div>

      <div className="rounded-2xl overflow-hidden border mx-4" style={{ touchAction: "pan-x pan-y" }}>  
        <GoogleMap  
          mapContainerStyle={mapContainerStyle}  
          center={center}  
          zoom={12}  
          options={{ 
            mapTypeControl: false, 
            streetViewControl: false, 
            fullscreenControl: false,
            gestureHandling: "greedy",
            zoomControl: true,
            scaleControl: true,
            rotateControl: false,
            styles: [
              {
                featureType: "poi",
                elementType: "labels",
                stylers: [{ visibility: "off" }]
              }
            ]
          }}  
        >
          {sessions.map(s => {  
            if (!mountedRef.current) return null;
            
            console.log("[map] Rendering session marker:", s.id, s.title);
            const start = { lat: s.location_lat ?? s.start_lat, lng: s.location_lng ?? s.start_lng };  
            const radius = s.blur_radius_m ?? 1000;  
            const isOwnSession = currentUser && s.host_id === currentUser.id;
            const shouldBlur = !hasSub && !isOwnSession;
            const startShown = shouldBlur ? jitterDeterministic(start.lat, start.lng, radius, s.id) : start;
            
            const showPolyline = hasSub && s.route_polyline && !isOwnSession;
            const path = showPolyline ? pathFromPolyline(s.route_polyline) : [];

            const markerIcon = createCustomMarkerIcon(!!isOwnSession, hasSub);

            return (  
              <div key={s.id}>  
                <MarkerF   
                  position={startShown}   
                  title={`${s.title} • ${dbToUiIntensity(s.intensity || undefined)}${isOwnSession ? ' (Votre session)' : ''}`}
                  icon={markerIcon}
                  onClick={() => {
                    if (!mountedRef.current) return;
                    console.log("[map] Marker clicked:", s.id);
                    navigate(`/session/${s.id}`);
                  }}  
                />  
                {showPolyline && path.length > 1 && (  
                  <Polyline 
                    path={path} 
                    options={{ 
                      clickable: false, 
                      strokeOpacity: 0.9, 
                      strokeWeight: 4,
                      strokeColor: '#059669'
                    }} 
                  />  
                )}  
              </div>  
            );  
          })}  
        </GoogleMap>  
      </div>

      {loading && (  
        <div className="text-center text-sm text-muted-foreground py-2">
          <div className="flex items-center justify-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
            Chargement des sessions…
          </div>
        </div>  
      )}  
      {error && (
        <div className="text-center text-sm text-destructive py-2">{error}</div>
      )}  
      {!loading && sessions.length === 0 && (
        <div className="text-center text-sm text-muted-foreground py-8">
          <MapPin className="mx-auto h-8 w-8 mb-2 opacity-50" />
          <p>Aucune session disponible pour le moment</p>
          <p className="text-xs mt-1">Revenez plus tard ou créez votre propre session !</p>
        </div>
      )}
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