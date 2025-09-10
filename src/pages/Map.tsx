import { useEffect, useMemo, useRef, useState } from "react";
import { GoogleMap, Polyline, MarkerF } from "@react-google-maps/api";
import { useNavigate } from "react-router-dom";
import { getSupabase } from "@/integrations/supabase/client";
import polyline from "@mapbox/polyline";
import { dbToUiIntensity } from "@/lib/sessions/intensity";
import { MapErrorBoundary } from "@/components/MapErrorBoundary"; // Ajout du boundary
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
};

// Brouillage déterministe et cohérent par session (évite le "saut")
function seededNoise(seed: string) {  
  let h = 2166136261;  
  for (let i=0; i<seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }  
  const u = ((h >>> 0) % 10000) / 10000;  
  const v = (((h * 48271) >>> 0) % 10000) / 10000;  
  return { u, v };  
}  
function jitterDeterministic(lat:number, lng:number, meters:number, seed:string): LatLng {  
  const r = meters / 111320; // ≈ degrés/terre  
  const { u, v } = seededNoise(seed);  
  const w = r * Math.sqrt(u), t = 2 * Math.PI * v;  
  return { lat: lat + w * Math.cos(t), lng: lng + w * Math.sin(t) };  
}

// Nouveau composant page interne avec fallback d'erreur
function MapPageInner() {  
  const navigate = useNavigate();  
  const supabase = getSupabase();  
  const [center, setCenter] = useState<LatLng>({ lat: 48.8566, lng: 2.3522 });  
  const [sessions, setSessions] = useState<SessionRow[]>([]);  
  const [hasSub, setHasSub] = useState<boolean>(false);  
  const [loading, setLoading] = useState(true);  
  const [error, setError] = useState<string | null>(null);

  // Créer une icône personnalisée moderne pour les marqueurs
  const createCustomMarkerIcon = (isSubscribed: boolean) => {
    const size = 12; // Plus petit
    const color = isSubscribed ? '#065f46' : '#047857'; // Vert beaucoup plus foncé
    
    // SVG très simple et petit
    const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${size/2}" cy="${size/2}" r="${size/2-1}" fill="${color}" stroke="white" stroke-width="1"/>
    </svg>`;
    
    console.log("[map] Creating custom icon, color:", color, "size:", size);
    
    if (typeof window !== 'undefined' && window.google) {
      return {
        url: 'data:image/svg+xml,' + encodeURIComponent(svg),
        scaledSize: new window.google.maps.Size(size, size),
        anchor: new window.google.maps.Point(size/2, size/2),
      };
    } else {
      // Fallback simple pour le développement
      return {
        url: 'data:image/svg+xml,' + encodeURIComponent(svg),
      };
    }
  };

  // Mémoriser l'icône pour éviter les re-créations
  const customIcon = useMemo(() => createCustomMarkerIcon(hasSub), [hasSub]);

  // Geoloc initiale avec options mobiles optimisées
  useEffect(() => {  
    if (navigator.geolocation) {  
      console.log("[map] Requesting user location for mobile...");
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userPos = { 
            lat: position.coords.latitude, 
            lng: position.coords.longitude 
          };
          console.log("[map] User location found:", userPos);
          setCenter(userPos);
        },
        (error) => {
          console.warn("[map] Geolocation error:", error);
          // Garder Paris par défaut si erreur
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000 // 5 minutes
        }
      );  
    }  
  }, []);

  // Lire abonnement + sessions  
  async function fetchGateAndSessions() {  
    if (!supabase) {
      console.log("[map] No supabase client");
      return;
    }  
    setLoading(true);  
    setError(null);
    console.log("[map] Fetching sessions...");
    try {  
      const { data: { user } } = await supabase.auth.getUser();  
      if (user) {  
        console.log("[map] User authenticated:", user.id);
        const { data: prof } = await supabase  
          .from("profiles")  
          .select("sub_status, sub_current_period_end")  
          .eq("id", user.id)  
          .maybeSingle();  
        const active = prof?.sub_status && ["active","trialing"].includes(prof.sub_status)  
          && prof?.sub_current_period_end && new Date(prof.sub_current_period_end) > new Date();  
        setHasSub(!!active);  
        console.log("[map] Subscription active:", !!active);
      } else {  
        console.log("[map] No authenticated user");
        setHasSub(false);  
      }

      // Requête plus permissive pour récupérer toutes les sessions futures
      const cutoffDate = new Date();
      cutoffDate.setHours(0, 0, 0, 0); // Début d'aujourd'hui
      
      console.log("[map] Fetching sessions from:", cutoffDate.toISOString());
      
      const { data, error } = await supabase  
        .from("sessions")  
        .select("id,title,scheduled_at,start_lat,start_lng,end_lat,end_lng,distance_km,route_polyline,intensity,session_type,blur_radius_m")  
        .gte("scheduled_at", cutoffDate.toISOString())
        .eq("status", "published") // Seulement les sessions publiées
        .order("scheduled_at", { ascending: true })  
        .limit(500);

      if (error) {  
        console.error("[map] Fetch sessions error:", error);
        setError("Erreur lors du chargement des sessions. Veuillez réessayer.");
        throw error;  
      }

      console.log("[map] Raw sessions data:", data?.length || 0, "sessions");
      console.log("[map] Sessions details:", data);

      const mappedSessions = (data ?? []).map((s) => ({  
        ...s,  
        location_lat: s.start_lat,  
        location_lng: s.start_lng,  
      }));

      console.log("[map] Mapped sessions:", mappedSessions.length, "sessions");
      setSessions(mappedSessions);  
    } catch (e) {  
      console.error("[map] Load error:", e);
      setError("Une erreur inattendue est survenue lors du chargement des données.");
    } finally {  
      setLoading(false);  
    }
  }

  useEffect(() => { fetchGateAndSessions(); }, []);
  
  // Écouter les événements de création de session
  useEffect(() => {
    const handleSessionCreated = () => {
      console.log("[map] Session created event received, refreshing sessions");
      fetchGateAndSessions();
    };

    window.addEventListener('sessionCreated', handleSessionCreated);
    return () => window.removeEventListener('sessionCreated', handleSessionCreated);
  }, []);

  // Realtime  
  useEffect(() => {  
    if (!supabase) return;  
    console.log("[map] Setting up realtime listener");
    const ch = supabase.channel("sessions-map")  
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, (payload: any) => {  
        console.log("[map] Realtime session update:", payload);
        fetchGateAndSessions();  
      })  
      .subscribe((status) => {
        console.log("[map] Realtime channel status:", status);
      });  
    return () => { 
      console.log("[map] Cleaning up realtime channel");
      supabase.removeChannel(ch); 
    };  
  }, []);

  const mapContainerStyle = useMemo(() => ({ 
    width: "100%", 
    height: "calc(100vh - 120px)",
    touchAction: "pan-x pan-y" // Permet le déplacement avec un doigt
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
            Coordonnées approximatives pour les non-abonnés • <a href="/subscribe" className="underline">S'abonner</a>  
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
            // Options mobiles optimisées
            gestureHandling: "greedy", // Permet navigation avec 1 doigt
            zoomControl: true,
            scaleControl: true,
            rotateControl: false,
            // Style mobile-friendly
            styles: [
              {
                featureType: "poi",
                elementType: "labels",
                stylers: [{ visibility: "off" }] // Masque les POI pour une carte plus claire
              }
            ]
          }}  
        >
            {sessions.map(s => {  
              console.log("[map] Rendering session marker:", s.id, s.title);
              const start = { lat: s.location_lat ?? s.start_lat, lng: s.location_lng ?? s.start_lng };  
              const radius = s.blur_radius_m ?? 1000;  
              const startShown = hasSub ? start : jitterDeterministic(start.lat, start.lng, radius, s.id);  
              const showPolyline = hasSub && s.route_polyline;  
              const path = showPolyline ? pathFromPolyline(s.route_polyline) : [];

              return (  
                <div key={s.id}>  
                  <MarkerF   
                    position={startShown}   
                    title={`${s.title} • ${dbToUiIntensity(s.intensity || undefined)}`}
                    icon={customIcon}
                    onClick={() => {
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
                      strokeColor: '#059669' // Couleur verte MeetRun
                    }} 
                  />  
                )}  
              </div>  
            );  
          })}  
        </GoogleMap>  
      </div>

      {loading && (  
        <div className="text-center text-sm text-muted-foreground py-2">Chargement…</div>  
      )}  
      {error && (
        <div className="text-center text-sm text-destructive py-2">{error}</div>
      )}  
    </div>  
  );  
}

// Wrapping avec ErrorBoundary pour robustesse
export default function MapPage() {
  return (
    <MapErrorBoundary>
      <MapPageInner />
    </MapErrorBoundary>
  );
}