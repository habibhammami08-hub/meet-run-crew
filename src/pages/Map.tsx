import { useEffect, useMemo, useRef, useState } from "react";
import { GoogleMap, Polyline, MarkerF } from "@react-google-maps/api";
import { useNavigate } from "react-router-dom";
import { getSupabase } from "@/integrations/supabase/client";
import polyline from "@mapbox/polyline";
import { dbToUiIntensity } from "@/lib/sessions/intensity";
import { MapErrorBoundary } from "@/components/MapErrorBoundary"; // Ajout du boundary

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

  // Geoloc initiale  
  useEffect(() => {  
    if (navigator.geolocation) {  
      navigator.geolocation.getCurrentPosition(p => {  
        setCenter({ lat: p.coords.latitude, lng: p.coords.longitude });  
      });  
    }  
  }, []);

  // Lire abonnement + sessions  
  async function fetchGateAndSessions() {  
    if (!supabase) return;  
    setLoading(true);  
    setError(null);
    try {  
      const { data: { user } } = await supabase.auth.getUser();  
      if (user) {  
        const { data: prof } = await supabase  
          .from("profiles")  
          .select("sub_status, sub_current_period_end")  
          .eq("id", user.id)  
          .maybeSingle();  
        const active = prof?.sub_status && ["active","trialing"].includes(prof.sub_status)  
          && prof?.sub_current_period_end && new Date(prof.sub_current_period_end) > new Date();  
        setHasSub(!!active);  
      } else {  
        setHasSub(false);  
      }

      const { data, error } = await supabase  
        .from("sessions")  
        .select("id,title,scheduled_at,start_lat,start_lng,end_lat,end_lng,distance_km,route_polyline,intensity,session_type,blur_radius_m")  
        .gte("scheduled_at", new Date(Date.now() - 1000*60*60*24).toISOString()) // d'hier → futur  
        .order("scheduled_at", { ascending: true })  
        .limit(500);

      if (error) {  
        setError("Erreur lors du chargement des sessions. Veuillez réessayer.");
        console.error("[map] fetch sessions error", error);  
        throw error;  
      }

      const mappedSessions = (data ?? []).map((s) => ({  
        ...s,  
        location_lat: s.start_lat,  
        location_lng: s.start_lng,  
      }));

      setSessions(mappedSessions);  
    } catch (e) {  
      setError("Une erreur inattendue est survenue lors du chargement des données.");
      console.error("[map] load error", e);  
    } finally {  
      setLoading(false);  
    }
  }

  useEffect(() => { fetchGateAndSessions(); }, []);

  // Realtime  
  useEffect(() => {  
    if (!supabase) return;  
    const ch = supabase.channel("sessions-map")  
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, (payload: any) => {  
        fetchGateAndSessions();  
      })  
      .subscribe();  
    return () => { supabase.removeChannel(ch); };  
  }, []);

  const mapContainerStyle = useMemo(() => ({ width: "100%", height: "calc(100vh - 120px)" }), []);  
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

      <div className="rounded-2xl overflow-hidden border mx-4">  
        <GoogleMap  
          mapContainerStyle={mapContainerStyle}  
          center={center}  
          zoom={12}  
          options={{ mapTypeControl:false, streetViewControl:false, fullscreenControl:false }}  
        >  
            {sessions.map(s => {  
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
                    onClick={() => navigate(`/session/${s.id}`)}  
                  />  
                {showPolyline && path.length > 1 && (  
                  <Polyline path={path} options={{ clickable: false, strokeOpacity: 0.9, strokeWeight: 4 }} />  
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