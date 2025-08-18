import { useEffect, useMemo, useRef, useState } from "react";
import { GoogleMap, MarkerF, DirectionsRenderer } from "@react-google-maps/api";
import { getSupabase, getCurrentUserSafe } from "@/integrations/supabase/client";
import { uiToDbIntensity } from "@/lib/sessions/intensity";

type Pt = google.maps.LatLngLiteral;

export default function CreateRun() {
  const supabase = getSupabase();
  const [userReady, setUserReady] = useState<"loading"|"ok"|"none">("loading");
  const [currentUser, setCurrentUser] = useState<any>(null);
  
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
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(p =>
        setCenter({ lat: p.coords.latitude, lng: p.coords.longitude })
      );
    }
  }, []);

  // Vérifier l'état d'authentification de façon robuste
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!supabase) { setUserReady("none"); return; }
      const { data: { user } } = await supabase.auth.getUser();
      if (!alive) return;
      setCurrentUser(user);
      setUserReady(user ? "ok" : "none");
    })();
    return () => { alive = false; };
  }, [supabase]);

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
    const t = setTimeout(() => { if (start && end) calcRoute(); }, 250);
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

      // Utiliser l'utilisateur déjà vérifié
      if (!currentUser) {
        alert("Veuillez vous connecter pour créer une session.");
        return;
      }

      // S'assurer que le profil existe (pour RLS)
      const { data: prof, error: pe } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (!prof) {
        // déclenche la création via upsert minimal
        const { error: upErr } = await supabase.from('profiles').upsert({ 
          id: currentUser.id, 
          email: currentUser.email || '',
          full_name: currentUser.email?.split('@')[0] || 'Runner' 
        });
        if (upErr) {
          alert("Votre profil n'est pas prêt. Déconnectez/reconnectez-vous puis réessayez.");
          return;
        }
      }

      // Préconditions UI
      if (!start || !end) { alert("Définissez un départ et une arrivée (clics sur la carte)."); return; }
      if (!dirResult) { await calcRoute(); if (!dirResult) { alert("Impossible de calculer l'itinéraire."); return; } }
      if (!title?.trim()) { alert("Indiquez un titre."); return; }
      const scheduledIso = toIsoFromLocal(dateTime);
      if (!scheduledIso) { alert("Date/heure invalide."); return; }
      if (new Date(scheduledIso) <= new Date()) { alert("La date doit être dans le futur."); return; }

      // Extractions Directions
      const r = (dirResult || {} as any).routes?.[0];
      const legs = r?.legs ?? [];
      const meters = legs.reduce((s: number, l: any) => s + (l?.distance?.value ?? 0), 0);
      const poly = r?.overview_polyline?.toString?.() ?? r?.overview_polyline?.points ?? "";
      const startAddr = legs[0]?.start_address ?? null;
      const endAddr = legs[legs.length - 1]?.end_address ?? null;

      // Payload DB (ajoute description si dispo côté schéma)
      const payload: any = {
        host_id: currentUser.id,
        title: title.trim(),
        scheduled_at: scheduledIso,
        start_lat: Number(start.lat), start_lng: Number(start.lng),
        end_lat: Number(end.lat), end_lng: Number(end.lng),
        distance_km: meters / 1000,
        route_distance_m: meters,
        route_polyline: poly || null,
        start_place: startAddr, end_place: endAddr,
        intensity: uiToDbIntensity(intensityState),
        session_type: sessionTypeState,
        max_participants: Math.min(20, Math.max(3, Number(maxParticipantsState) || 10)),
        status: "published",
      };
      if (description?.trim()) payload.description = description.trim();

      console.info("[create] inserting payload", payload);
      const { data, error } = await supabase.from("sessions").insert(payload).select("id,title,scheduled_at").single();
      if (error) { 
        console.error("[sessions.insert] error", error); 
        alert("Création impossible : " + (error.message || error.details || "erreur inconnue")); 
        return; 
      }

      console.info("[create] insert SUCCESS", data);
      
      // Forcer la mise à jour du profil après création de session
      if (supabase) {
        try {
          // Récupérer le profil actuel pour incrémenter sessions_hosted
          const { data: currentProfile } = await supabase
            .from('profiles')
            .select('sessions_hosted')
            .eq('id', currentUser.id)
            .single();
          
          if (currentProfile) {
            await supabase
              .from('profiles')
              .update({ 
                sessions_hosted: (currentProfile.sessions_hosted || 0) + 1,
                updated_at: new Date().toISOString()
              })
              .eq('id', currentUser.id);
          }
          
          // Déclencher l'événement de refresh du profil
          window.dispatchEvent(new CustomEvent('profileRefresh', { detail: { userId: currentUser.id } }));
        } catch (profileError) {
          console.warn("[create] Failed to update profile stats:", profileError);
        }
      }
      
      alert("Session créée 🎉 ID: " + data.id);
      // Reset + retour carte
      setStart(null); setEnd(null); setWaypoints([]); setDirResult(null);
      setTitle(""); setDateTime(""); setIntensityState("course modérée"); setSessionTypeState("mixed"); setMaxParticipantsState(10); setDescription("");
      if (typeof window !== "undefined") window.location.assign("/");
    } catch (e: any) {
      console.error("[create] fatal", e);
      alert("Erreur lors de la création. Réessayez.");
    } finally {
      setIsSaving(false);
    }
  }

  // États de chargement et erreur d'authentification
  if (userReady === "loading") {
    return <div className="p-4 text-sm opacity-70">Vérification de votre session…</div>;
  }
  if (userReady === "none") {
    return <div className="p-4 text-sm">
      Merci de vous connecter pour créer une session. <a href="/auth" className="underline">Se connecter</a>
    </div>;
  }

  return (
    <div className="p-4 space-y-6">
      {/* Formulaire */}
      <div className="rounded-2xl border shadow-sm p-4">
        <h1 className="text-xl font-semibold mb-2">Créer une session</h1>
        <p className="text-sm text-muted-foreground mb-4">
          Cliquez sur la carte pour placer le <b>départ</b>, puis l'<b>arrivée</b>, et ajoutez des points intermédiaires si besoin.
        </p>

        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Titre</label>
            <input className="w-full rounded-xl border px-3 py-2" value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="Sortie running du matin" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Date & heure</label>
            <input className="w-full rounded-xl border px-3 py-2" type="datetime-local" value={dateTime} onChange={(e)=>setDateTime(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Carte - placée après date/heure sur mobile */}
      <div className="rounded-2xl overflow-hidden border shadow-sm">
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
                console.log("[directions] Route changed via drag");
              }}
            />
          )}
        </GoogleMap>
      </div>

      {/* Suite du formulaire */}
      <div className="rounded-2xl border shadow-sm p-4">
        <div className="grid grid-cols-1 gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Intensité</label>
              <select className="w-full rounded-xl border px-3 py-2" value={intensityState} onChange={(e)=>setIntensityState(e.target.value)}>
                <option>marche</option>
                <option>course modérée</option>
                <option>course intensive</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Type de session</label>
              <select className="w-full rounded-xl border px-3 py-2" value={sessionTypeState} onChange={(e)=>setSessionTypeState(e.target.value as any)}>
                <option value="mixed">mixte</option>
                <option value="women">femmes</option>
                <option value="men">hommes</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Participants max</label>
            <input className="w-full rounded-xl border px-3 py-2" type="number" min={3} max={20} value={maxParticipantsState}
              onChange={(e)=>setMaxParticipantsState(Number(e.target.value || 10))} />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description (optionnel)</label>
            <textarea className="w-full rounded-xl border px-3 py-2 min-h-[100px]" value={description}
              onChange={(e)=>setDescription(e.target.value)} placeholder="Détails pratiques, niveau visé, équipements, etc." />
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Distance: {distanceKm ? <b>{distanceKm.toFixed(2)} km</b> : "—"} (calculée depuis l'itinéraire)
            </div>
            <button type="button" className="rounded-xl px-4 py-2 border hover:bg-accent"
              onClick={()=>{ setWaypoints([]); if (start && end) calcRoute(start, end, []); }}>
              Réinitialiser waypoints
            </button>
          </div>

          <button
            type="button"
            className="rounded-xl px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            disabled={!!disabledReason()}
            onClick={onSubmit}
          >
            {isSaving ? "Enregistrement..." : "Créer la session"}
          </button>
          {!!disabledReason() && <p className="text-xs text-amber-600">⚠️ {disabledReason()}</p>}
        </div>
      </div>
    </div>
  );
}