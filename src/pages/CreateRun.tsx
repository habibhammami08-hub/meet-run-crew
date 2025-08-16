import { useEffect, useMemo, useRef, useState } from "react";
import GoogleMapProvider from "@/components/Map/GoogleMapProvider";
import { GoogleMap, MarkerF, DirectionsRenderer } from "@react-google-maps/api";
import { getSupabase, getCurrentUserSafe } from "@/integrations/supabase/client";
import { uiToDbIntensity } from "@/lib/sessions/intensity";

type Pt = google.maps.LatLngLiteral;

export default function CreateRun() {
  const supabase = getSupabase();
  const [center, setCenter] = useState<Pt>({ lat: 48.8566, lng: 2.3522 });
  const [start, setStart] = useState<Pt | null>(null);
  const [end, setEnd] = useState<Pt | null>(null);
  const [waypoints, setWaypoints] = useState<Pt[]>([]);
  const [dirResult, setDirResult] = useState<google.maps.DirectionsResult | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);

  const [title, setTitle] = useState("");
  const [dateTime, setDateTime] = useState("");
  const [intensityState, setIntensityState] = useState("course modérée");
  const [sessionTypeState, setSessionTypeState] = useState<"mixed"|"women"|"men">("mixed");
  const [maxParticipantsState, setMaxParticipantsState] = useState<number>(10);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(p =>
        setCenter({ lat: p.coords.latitude, lng: p.coords.longitude })
      );
    }
  }, []);

  const mapContainerStyle = useMemo(() => ({ width: "100%", height: "70vh" }), []);

  function disabledReason() {
    if (isSaving) return "Sauvegarde en cours…";
    if (!start) return "Définissez un point de départ (clic sur la carte)";
    if (!end) return "Définissez un point d'arrivée (clic sur la carte)";
    if (!dirResult) return "Calculez l'itinéraire";
    if (!title?.trim()) return "Indiquez un titre";
    if (!dateTime) return "Choisissez date & heure";
    return "";
  }

  const handleMapClick = (e: google.maps.MapMouseEvent) => {
    const lat = e.latLng?.lat(), lng = e.latLng?.lng();
    if (lat == null || lng == null) return;
    if (!start) setStart({ lat, lng });
    else if (!end) setEnd({ lat, lng });
    else setWaypoints(prev => [...prev, { lat, lng }]);
  };

  async function calcRoute(origin?: Pt | null, dest?: Pt | null, wps?: Pt[]) {
    const o = origin ?? start, d = dest ?? end;
    if (!o || !d) return;
    const svc = new google.maps.DirectionsService();
    const res = await svc.route({
      origin: o,
      destination: d,
      waypoints: (wps ?? waypoints).map(w => ({ location: w })),
      travelMode: google.maps.TravelMode.WALKING,
      provideRouteAlternatives: false,
      optimizeWaypoints: false,
    });
    setDirResult(res);
    const meters = res.routes[0].legs?.reduce((s, l) => s + (l.distance?.value ?? 0), 0) ?? 0;
    setDistanceKm(meters / 1000);
  }

  useEffect(() => {
    const t = setTimeout(() => { if (start && end) calcRoute(); }, 300);
    return () => clearTimeout(t);
  }, [JSON.stringify(start), JSON.stringify(end), JSON.stringify(waypoints)]);

  function toIsoFromLocal(input: string): string | null {
    if (!input) return null;
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  async function onSubmit() {
    if (!supabase) { alert("Configuration Supabase manquante."); return; }
    setIsSaving(true);
    try {
      console.info("[create] submit", { title, dateTime, hasStart: !!start, hasEnd: !!end, hasDir: !!dirResult });

      // auth robuste
      const { user, source } = await getCurrentUserSafe({ timeoutMs: 3000 });
      console.info("[create] current user:", { hasUser: !!user, source });
      if (!user) { alert("Connectez-vous pour créer une session."); return; }

      // préconditions UI
      if (!start || !end) { alert("Définissez un départ et une arrivée (clics sur la carte)."); return; }
      if (!dirResult) { await calcRoute(); if (!dirResult) { alert("Impossible de calculer l'itinéraire."); return; } }
      if (!title?.trim()) { alert("Indiquez un titre."); return; }
      const scheduledIso = toIsoFromLocal(dateTime);
      if (!scheduledIso) { alert("Date/heure invalide."); return; }

      // extractions Directions
      const r = (dirResult || {} as any).routes?.[0];
      const legs = r?.legs ?? [];
      const meters = legs.reduce((s: number, l: any) => s + (l?.distance?.value ?? 0), 0);
      const polyline = r?.overview_polyline?.toString?.() ?? r?.overview_polyline?.points ?? "";
      const startAddr = legs[0]?.start_address ?? null;
      const endAddr = legs[legs.length - 1]?.end_address ?? null;

      // payload conforme schéma
      const payload = {
        host_id: user.id,
        title: title.trim(),
        scheduled_at: scheduledIso,
        start_lat: Number(start.lat), start_lng: Number(start.lng),
        end_lat: Number(end.lat), end_lng: Number(end.lng),
        distance_km: meters / 1000,
        route_distance_m: meters,
        route_polyline: polyline || null,
        start_place: startAddr, end_place: endAddr,
        intensity: uiToDbIntensity(intensityState),
        session_type: sessionTypeState,
        max_participants: Math.min(20, Math.max(2, Number(maxParticipantsState) || 10)),
        status: "published",
      };

      console.info("[create] inserting payload", payload);
      const { data, error } = await supabase.from("sessions").insert(payload).select("id").single();
      if (error) { console.error("[sessions.insert] error", error); alert("Création impossible : " + (error.message || error.details || "erreur inconnue")); return; }

      console.info("[create] insert OK", data);
      alert("Session créée 🎉");
      // reset minimal + retour carte
      setStart(null); setEnd(null); setWaypoints([]); setDirResult(null);
      setTitle(""); setDateTime(""); setIntensityState("course modérée"); setSessionTypeState("mixed"); setMaxParticipantsState(10);
      if (typeof window !== "undefined") window.location.assign("/");
    } catch (e: any) {
      console.error("[create] fatal", e);
      alert("Erreur lors de la création. Réessayez.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <GoogleMapProvider>
      <div className="grid md:grid-cols-2 gap-4 p-4">
        <div className="space-y-3">
          <h1 className="text-xl font-semibold">Créer une session</h1>

          <label className="block text-sm font-medium">Titre</label>
          <input className="input w-full" value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="Sortie running" />

          <label className="block text-sm font-medium">Date & heure</label>
          <input className="input w-full" type="datetime-local" value={dateTime} onChange={(e)=>setDateTime(e.target.value)} />

          <label className="block text-sm font-medium">Intensité</label>
          <select className="input w-full" value={intensityState} onChange={(e)=>setIntensityState(e.target.value)}>
            <option>marche</option>
            <option>course modérée</option>
            <option>course intensive</option>
          </select>

          <label className="block text-sm font-medium">Type de session</label>
          <select className="input w-full" value={sessionTypeState} onChange={(e)=>setSessionTypeState(e.target.value as any)}>
            <option value="mixed">mixte</option>
            <option value="women">femmes</option>
            <option value="men">hommes</option>
          </select>

          <label className="block text-sm font-medium">Participants max</label>
          <input className="input w-full" type="number" min={2} max={20} value={maxParticipantsState}
            onChange={(e)=>setMaxParticipantsState(Number(e.target.value || 10))} />

          <div className="text-sm text-muted-foreground">
            Distance: {distanceKm ? `${distanceKm.toFixed(2)} km` : "—"} (calculée depuis l'itinéraire)
          </div>

          <button type="button" className="btn btn-primary" disabled={!!disabledReason()} onClick={onSubmit}>
            {isSaving ? "Enregistrement..." : "Créer la session"}
          </button>
          {!!disabledReason() && <p className="text-xs text-amber-600">⚠️ {disabledReason()}</p>}
        </div>

        <div className="rounded-2xl overflow-hidden border">
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            zoom={13}
            center={start ?? center}
            options={{ mapTypeControl:false, streetViewControl:false, fullscreenControl:false }}
            onClick={handleMapClick}
          >
            {start && <MarkerF position={start} />}
            {end && <MarkerF position={end} />}
            {start && end && dirResult && (
              <DirectionsRenderer
                directions={dirResult}
                options={{ draggable: true, suppressMarkers: true }}
                onDirectionsChanged={() => {
                  // Note: onDirectionsChanged ne fournit pas l'instance renderer
                  // On pourrait implémenter une logique de re-calcul ici si nécessaire
                }}
              />
            )}
          </GoogleMap>
        </div>
      </div>
    </GoogleMapProvider>
  );
}