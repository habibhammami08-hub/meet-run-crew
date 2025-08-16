import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleMap, Marker, Autocomplete, DirectionsRenderer } from "@react-google-maps/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { getSupabase, getCurrentUserSafe } from "@/integrations/supabase/client";
import GoogleMapProvider from "@/components/Map/GoogleMapProvider";
import { Calendar, Clock, MapPin, Users, Loader2 } from "lucide-react";
import { uiToDbIntensity } from "@/lib/sessions/intensity";

type Pt = google.maps.LatLngLiteral;

export default function CreateRun() {
  const [authState, setAuthState] = useState<"loading"|"no-session"|"session">("loading");
  const navigate = useNavigate();
  const { toast } = useToast();
  const supabase = getSupabase();

  // Map state
  const [center, setCenter] = useState<Pt>({ lat: 48.8566, lng: 2.3522 });
  const [start, setStart] = useState<Pt | null>(null);
  const [end, setEnd] = useState<Pt | null>(null);
  const [waypoints, setWaypoints] = useState<Pt[]>([]);
  const [dirResult, setDirResult] = useState<google.maps.DirectionsResult | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [dateTime, setDateTime] = useState("");
  const [intensityState, setIntensityState] = useState("course modérée");
  const [sessionTypeState, setSessionTypeState] = useState("mixed");
  const [maxParticipantsState, setMaxParticipantsState] = useState(10);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    scheduled_at: "",
    intensity: "",
    session_type: "",
    max_participants: 10
  });

  const [isSaving, setIsSaving] = useState(false);
  const acStartRef = useRef<google.maps.places.Autocomplete | null>(null);
  const acEndRef = useRef<google.maps.places.Autocomplete | null>(null);

  // Check auth state
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { user } = await getCurrentUserSafe({ timeoutMs: 2000 });
      if (!mounted) return;
      setAuthState(user ? "session" : "no-session");
    })();
    return () => { mounted = false; };
  }, []);

  // Get user location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(p =>
        setCenter({ lat: p.coords.latitude, lng: p.coords.longitude })
      );
    }
  }, []);

  // Calculate route with debounce
  const calcRoute = useCallback(async () => {
    if (!start || !end) return;
    
    try {
      const svc = new google.maps.DirectionsService();
      const res = await svc.route({
        origin: start,
        destination: end,
        waypoints: waypoints.map(w => ({ location: w })),
        travelMode: google.maps.TravelMode.WALKING,
        optimizeWaypoints: false,
        provideRouteAlternatives: false,
      });
      
      setDirResult(res);
      const meters = res.routes[0].legs?.reduce((sum, l) => sum + (l.distance?.value ?? 0), 0) ?? 0;
      setDistanceKm(meters / 1000);
    } catch (error) {
      console.error("Erreur calcul itinéraire:", error);
      toast({
        title: "Erreur",
        description: "Impossible de calculer l'itinéraire",
        variant: "destructive"
      });
    }
  }, [start, end, waypoints, toast]);

  // Recalculate route on changes (with debounce)
  useEffect(() => {
    const timer = setTimeout(calcRoute, 400);
    return () => clearTimeout(timer);
  }, [calcRoute]);

  // Forcer le calcul des directions si manquant
  const calcRouteIfNeeded = useCallback(async () => {
    if (dirResult || !start || !end) return;
    try {
      console.info("[create] calcRouteIfNeeded() starting...");
      const svc = new google.maps.DirectionsService();
      const res = await svc.route({
        origin: start,
        destination: end,
        waypoints: waypoints.map(w => ({ location: w })),
        travelMode: google.maps.TravelMode.WALKING,
        optimizeWaypoints: false,
        provideRouteAlternatives: false,
      });
      setDirResult(res);
      const meters = res.routes[0].legs?.reduce((sum, l) => sum + (l.distance?.value ?? 0), 0) ?? 0;
      setDistanceKm(meters / 1000);
      console.info("[create] calcRouteIfNeeded() -> OK", { meters });
    } catch (e) {
      console.error("[create] calcRouteIfNeeded() failed", e);
      throw e;
    }
  }, [start, end, waypoints, dirResult]);

  // Normalisation dateTime (retourne ISO ou null)
  function toIsoFromLocal(input: string): string | null {
    if (!input) return null;
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  // Handle route drag by user (DirectionsRenderer draggable)
  const onDirectionsChanged = useCallback((renderer: google.maps.DirectionsRenderer | null) => {
    const updated = renderer?.getDirections();
    if (!updated) return;
    
    setDirResult(updated);
    const meters = updated.routes[0].legs?.reduce((sum, l) => sum + (l.distance?.value ?? 0), 0) ?? 0;
    setDistanceKm(meters / 1000);
  }, []);

  const onPickStart = () => {
    const place = acStartRef.current?.getPlace();
    const geometry = place?.geometry?.location;
    if (geometry) {
      setStart({ lat: geometry.lat(), lng: geometry.lng() });
    }
  };

  const onPickEnd = () => {
    const place = acEndRef.current?.getPlace();
    const geometry = place?.geometry?.location;
    if (geometry) {
      setEnd({ lat: geometry.lat(), lng: geometry.lng() });
    }
  };

  const preventEnterSubmit = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
    }
  };

  const addWaypointByClick = (e: google.maps.MapMouseEvent) => {
    const lat = e.latLng?.lat();
    const lng = e.latLng?.lng();
    if (lat && lng) {
      setWaypoints(prev => [...prev, { lat, lng }]);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  function disabledReason() {
    if (isSaving) return "Sauvegarde en cours…";
    if (!start) return "Définissez un point de départ";
    if (!end) return "Définissez un point d'arrivée";
    if (!dirResult) return "Calculez l'itinéraire (Directions)";
    if (!title?.trim()) return "Indiquez un titre";
    if (!dateTime) return "Choisissez date & heure";
    return "";
  }

  function withTimeout<T>(p: Promise<T>, ms: number, label = "operation"): Promise<T> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(label + " timeout")), ms);
      p.then((v) => { clearTimeout(t); resolve(v); })
       .catch((e) => { clearTimeout(t); reject(e); });
    });
  }

  async function onSubmit() {
    if (!supabase) {
      console.error("[create] supabase client is null");
      alert("Configuration Supabase manquante (variables d'environnement).");
      return;
    }
    if (!supabase.auth) {
      console.error("[create] supabase.auth is undefined");
      alert("Module d'authentification indisponible. Rechargez la page.");
      return;
    }
    
    setIsSaving(true);
    try {
      console.info("[create] submit", { 
        title, 
        dateTime, 
        hasStart: !!start, 
        hasEnd: !!end, 
        hasDir: !!dirResult,
        intensityState,
        sessionTypeState,
        maxParticipantsState
      });

      // Forcer le calcul si dirResult absent
      if (!dirResult) {
        console.warn("[create] dirResult absent -> calcRouteIfNeeded()");
        try { 
          await calcRouteIfNeeded(); 
        } catch {
          alert("Impossible de calculer l'itinéraire. Ajustez A/B ou réessayez.");
          return;
        }
      }

      // Re-tester la présence d'un itinéraire
      if (!dirResult) {
        console.warn("[create] stop: still no dirResult after calc");
        alert("Calculez l'itinéraire avant de créer la session.");
        return;
      }

      console.info("[create] about to resolve current user (safe)");
      const { user, source } = await getCurrentUserSafe({ timeoutMs: 3000 });
      console.info("[create] current user:", { hasUser: !!user, source });
      if (!user) {
        alert("Vous devez être connecté pour créer une session.");
        return;
      }

      if (!start) { 
        console.warn("[create] stop: no start"); 
        alert("Définissez un point de départ"); 
        return; 
      }
      if (!end) { 
        console.warn("[create] stop: no end"); 
        alert("Définissez un point d'arrivée"); 
        return; 
      }
      if (!dirResult) { 
        console.warn("[create] stop: no dirResult"); 
        alert("Calculez l'itinéraire"); 
        return; 
      }
      if (!title?.trim()) { 
        console.warn("[create] stop: no title"); 
        alert("Indiquez un titre"); 
        return; 
      }
      if (!dateTime) { 
        console.warn("[create] stop: no dateTime"); 
        alert("Choisissez date & heure"); 
        return; 
      }

      // Normaliser la date
      const scheduledIso = toIsoFromLocal(dateTime);
      if (!scheduledIso) {
        console.warn("[create] stop: invalid dateTime", { dateTime });
        alert("Date/heure invalide. Merci de la re-sélectionner.");
        return;
      }

      const route = dirResult.routes?.[0];
      if (!route) { 
        console.warn("[create] stop: no route in dirResult"); 
        alert("Itinéraire invalide"); 
        return; 
      }
      
      const legs = route.legs ?? [];
      const meters = legs.reduce((s,l)=> s+(l.distance?.value ?? 0), 0);
      const polyline = route.overview_polyline?.toString?.() ?? (route.overview_polyline as any)?.points ?? "";
      const startAddr = legs[0]?.start_address ?? null;
      const endAddr = legs[legs.length-1]?.end_address ?? null;

      console.info("[create] computed", { 
        meters, 
        polylineLen: polyline?.length || 0, 
        scheduledIso,
        startAddr,
        endAddr
      });

      const payload = {
        host_id: user.id,
        title: title.trim(),
        scheduled_at: scheduledIso,
        start_lat: Number(start.lat), 
        start_lng: Number(start.lng),
        end_lat: Number(end.lat), 
        end_lng: Number(end.lng),
        distance_km: meters / 1000,
        route_distance_m: meters,
        route_polyline: polyline,
        start_place: startAddr, 
        end_place: endAddr,
        intensity: uiToDbIntensity(intensityState),
        session_type: ["mixed","women","men"].includes(sessionTypeState) ? sessionTypeState : "mixed",
        max_participants: Math.min(20, Math.max(2, Number(maxParticipantsState) || 10)),
        status: "published",
      };

      console.info("[create] inserting payload", payload);

      const { data, error } = await supabase.from("sessions").insert(payload).select("id").single();
      
      if (error) {
        console.error("[sessions.insert] error", { payload, error });
        alert("Création impossible : " + (error.message || error.details || "erreur inconnue"));
        return;
      }

      console.info("[create] insert OK", data);
      
      // Reset form
      try {
        setStart(null);
        setEnd(null);
        setWaypoints([]);
        setDirResult(null);
        setDistanceKm(null);
        setTitle("");
        setDateTime("");
        setIntensityState("course modérée");
        setSessionTypeState("mixed");
        setMaxParticipantsState(10);
      } catch {}
      
      alert("Session créée 🎉");
      if (typeof window !== "undefined") {
        window.location.assign("/");
      }
      
    } catch (e: any) {
      console.error("[create] fatal", e);
      alert("Erreur lors de la création. Vérifiez les champs et réessayez.");
    } finally {
      setIsSaving(false);
    }
  }

  async function testInsertMinimal() {
    if (!supabase) return alert("No supabase");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return alert("Connectez-vous");

    const nowIso = new Date().toISOString();
    const test = {
      host_id: user.id,
      title: "TEST DEBUG " + new Date().toLocaleString(),
      scheduled_at: nowIso,
      start_lat: 48.8566, 
      start_lng: 2.3522,
      end_lat: 48.8584, 
      end_lng: 2.2945,
      distance_km: 5,
      route_distance_m: 5000,
      route_polyline: "",
      start_place: "Paris",
      end_place: "Paris",
      intensity: "medium",
      session_type: "mixed",
      max_participants: 10,
      status: "published",
    };

    console.log("[testInsertMinimal] payload", test);
    const { data, error } = await supabase.from("sessions").insert(test).select("id").single();
    console.log("[testInsertMinimal] result", { data, error });
    if (error) alert("Insert test KO: " + (error.message || error.details));
    else alert("Insert test OK: " + data?.id);
  }

  if (authState === "loading") {
    return <div className="p-6 text-center text-sm text-muted-foreground">Chargement…</div>;
  }

  if (authState === "no-session") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="max-w-md w-full p-6 rounded-2xl border bg-background shadow-sm text-center space-y-3">
          <h2 className="text-lg font-semibold">Connectez-vous pour créer une session</h2>
          <p className="text-sm text-muted-foreground">
            La création de sessions est réservée aux utilisateurs connectés.
          </p>
          <a href="/auth" className="btn btn-primary inline-block">Se connecter</a>
        </div>
      </div>
    );
  }

  return (
    <GoogleMapProvider>
      <div className="min-h-screen bg-background p-4">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6">
            <h1 className="text-3xl font-bold">Créer une session</h1>
            <p className="text-muted-foreground">Organisez votre prochaine sortie running</p>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Form Section */}
            <div className="space-y-6">
              {/* Basic Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    Informations générales
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="title">Titre *</Label>
                    <Input
                      id="title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Ex: Course matinale au parc"
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => handleInputChange("description", e.target.value)}
                      placeholder="Décrivez votre session..."
                      rows={3}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Location */}
              <Card>
                <CardHeader>
                  <CardTitle>Itinéraire</CardTitle>
                  <CardDescription>
                    Choisissez votre point de départ et d'arrivée, puis personnalisez l'itinéraire
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Point de départ *</Label>
                    <Autocomplete
                      onLoad={ac => acStartRef.current = ac}
                      onPlaceChanged={onPickStart}
                      options={{
                        fields: ["geometry", "formatted_address", "name", "place_id"]
                      }}
                    >
                      <Input 
                        placeholder="Adresse ou lieu de départ" 
                        onKeyDown={preventEnterSubmit}
                      />
                    </Autocomplete>
                  </div>
                  <div>
                    <Label>Point d'arrivée *</Label>
                    <Autocomplete
                      onLoad={ac => acEndRef.current = ac}
                      onPlaceChanged={onPickEnd}
                      options={{
                        fields: ["geometry", "formatted_address", "name", "place_id"]
                      }}
                    >
                      <Input 
                        placeholder="Adresse ou lieu d'arrivée" 
                        onKeyDown={preventEnterSubmit}
                      />
                    </Autocomplete>
                  </div>
                  <div className="flex items-center justify-between">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setWaypoints([])}
                    >
                      Réinitialiser waypoints
                    </Button>
                    <span className="text-sm font-medium">
                      Distance: {distanceKm ? `${distanceKm.toFixed(2)} km` : "—"}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Date & Time */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Date et heure
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="scheduled_at">Date et heure *</Label>
                    <Input
                      id="scheduled_at"
                      type="datetime-local"
                      value={dateTime}
                      onChange={(e) => setDateTime(e.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Run Details */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Détails de la course
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Intensité *</Label>
                    <Select value={intensityState} onValueChange={(value) => setIntensityState(value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionnez l'intensité" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="marche">Marche</SelectItem>
                        <SelectItem value="course modérée">Course modérée</SelectItem>
                        <SelectItem value="course intensive">Course intensive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Type de session *</Label>
                    <Select value={sessionTypeState} onValueChange={(value) => setSessionTypeState(value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionnez le type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mixed">Mixte</SelectItem>
                        <SelectItem value="men">Hommes uniquement</SelectItem>
                        <SelectItem value="women">Femmes uniquement</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Participants */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Participants
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="max_participants">Nombre maximum de participants</Label>
                    <Input
                      id="max_participants"
                      type="number"
                      value={maxParticipantsState}
                      onChange={(e) => setMaxParticipantsState(parseInt(e.target.value) || 10)}
                      min="2"
                      max="50"
                    />
                  </div>
                </CardContent>
              </Card>

              <Button
                type="button"
                onClick={onSubmit}
                disabled={!!disabledReason()}
                className="w-full"
                size="lg"
              >
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSaving ? "Création en cours..." : "Créer la session"}
              </Button>
              
              {disabledReason() && (
                <p className="text-xs text-amber-600 mt-1">⚠️ {disabledReason()}</p>
              )}
              
              <Button type="button" variant="outline" className="w-full mt-2" onClick={testInsertMinimal}>
                Insertion de test (Supabase)
              </Button>
              
              {/* Debug panel */}
              <div className="mt-4 p-3 rounded-lg border text-xs bg-muted/30">
                <div className="font-medium mb-1">[Debug CreateRun]</div>
                <div>start: {start ? `${start.lat.toFixed(5)},${start.lng.toFixed(5)}` : "—"}</div>
                <div>end: {end ? `${end.lat.toFixed(5)},${end.lng.toFixed(5)}` : "—"}</div>
                <div>hasDirResult: {String(!!dirResult)}</div>
                <div>title: {title || "—"}</div>
                <div>dateTime: {dateTime || "—"}</div>
                <div>distanceKm: {distanceKm?.toFixed?.(2) ?? "—"}</div>
                <div>authState: {authState}</div>
                <div>intensity: {intensityState}</div>
                <div>sessionType: {sessionTypeState}</div>
                <div>maxParticipants: {maxParticipantsState}</div>
              </div>
            </div>

            {/* Map Section */}
            <Card>
              <CardHeader>
                <CardTitle>Carte interactive</CardTitle>
                <CardDescription>
                  Cliquez sur la carte pour ajouter des points intermédiaires
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[70vh] rounded-lg overflow-hidden">
                  <GoogleMap
                    mapContainerStyle={{ width: "100%", height: "100%" }}
                    zoom={13}
                    center={start ?? center}
                    options={{
                      mapTypeControl: false,
                      streetViewControl: false,
                      fullscreenControl: false
                    }}
                    onClick={addWaypointByClick}
                  >
                    {start && <Marker position={start} />}
                    {end && <Marker position={end} />}

                    {start && end && dirResult && (
                      <DirectionsRenderer
                        directions={dirResult}
                        options={{
                          draggable: true,
                          suppressMarkers: true
                        }}
                        onDirectionsChanged={() => {
                          // Cette callback est appelée quand l'utilisateur fait glisser l'itinéraire
                          // Mais l'API ne fournit pas directement les nouvelles directions
                          // On peut récupérer les directions mises à jour via le ref si nécessaire
                        }}
                      />
                    )}

                    {waypoints.map((w, idx) => (
                      <Marker
                        key={idx}
                        position={w}
                        icon={{
                          path: google.maps.SymbolPath.CIRCLE,
                          scale: 6,
                          fillColor: "#ef4444",
                          fillOpacity: 1,
                          strokeColor: "#ffffff",
                          strokeWeight: 2
                        }}
                      />
                    ))}
                  </GoogleMap>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </GoogleMapProvider>
  );
}