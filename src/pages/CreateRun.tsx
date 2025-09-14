// src/pages/CreateRun.tsx
import { useEffect, useMemo, useState } from "react";
import { GoogleMap, MarkerF, DirectionsRenderer } from "@react-google-maps/api";
import { useNavigate } from "react-router-dom";
import { getSupabase } from "@/integrations/supabase/client";
import { uiToDbIntensity } from "@/lib/sessions/intensity";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { LocationInput } from "@/components/ui/location-input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { MapPin, Users, Zap, Timer, Route, Calendar } from "lucide-react";

type Pt = google.maps.LatLngLiteral;

export default function CreateRun() {
  const navigate = useNavigate();
  const supabase = getSupabase();

  const [userReady, setUserReady] = useState<"loading" | "ok" | "none">("loading");
  const [currentUser, setCurrentUser] = useState<any>(null);

  const [center, setCenter] = useState<Pt>({ lat: 48.8566, lng: 2.3522 });
  const [start, setStart] = useState<Pt | null>(null);
  const [end, setEnd] = useState<Pt | null>(null);
  const [waypoints, setWaypoints] = useState<Pt[]>([]);
  const [dirResult, setDirResult] = useState<google.maps.DirectionsResult | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dateTime, setDateTime] = useState("");
  const [intensityState, setIntensityState] = useState("course modérée");
  const [sessionTypeState, setSessionTypeState] = useState<"mixed" | "women" | "men">("mixed");
  const [maxParticipantsState, setMaxParticipantsState] = useState<number>(10);
  const [isSaving, setIsSaving] = useState(false);
  const [isSelectingLocation, setIsSelectingLocation] = useState<"start" | "end" | null>(null);

  // Centrage initial sur la position de l'utilisateur
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((p) =>
        setCenter({ lat: p.coords.latitude, lng: p.coords.longitude })
      );
    }
  }, []);

  // Vérification d'authentification — tout est awaited (pas de builders fuyants)
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!supabase) {
        if (alive) setUserReady("none");
        return;
      }
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!alive) return;
        if (error) {
          setUserReady("none");
          return;
        }
        setCurrentUser(data.user ?? null);
        setUserReady(data.user ? "ok" : "none");
      } catch {
        if (alive) setUserReady("none");
      }
    })();
    return () => {
      alive = false;
    };
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
    const lat = e.latLng?.lat();
    const lng = e.latLng?.lng();
    if (lat == null || lng == null) return;

    if (isSelectingLocation === "start") {
      setStart({ lat, lng });
      setIsSelectingLocation(null);
    } else if (isSelectingLocation === "end") {
      setEnd({ lat, lng });
      setIsSelectingLocation(null);
    } else if (!start) {
      setStart({ lat, lng });
    } else if (!end) {
      setEnd({ lat, lng });
    } else {
      setWaypoints((prev) => [...prev, { lat, lng }]);
    }
  };

  async function calcRoute(origin?: Pt | null, dest?: Pt | null, wps?: Pt[]) {
    const o = origin ?? start;
    const d = dest ?? end;
    if (!o || !d) return;

    try {
      const svc = new google.maps.DirectionsService();
      const res = await svc.route({
        origin: o,
        destination: d,
        waypoints: (wps ?? waypoints).map((w) => ({ location: w })),
        travelMode: google.maps.TravelMode.WALKING,
        provideRouteAlternatives: false,
        optimizeWaypoints: false,
      });
      setDirResult(res);
      const meters =
        res.routes[0].legs?.reduce((s, l) => s + (l.distance?.value ?? 0), 0) ?? 0;
      setDistanceKm(meters / 1000);
    } catch (error) {
      console.error("[CreateRun] Directions error:", error);
    }
  }

  // Recalcule la route quand start/end/waypoints changent
  useEffect(() => {
    const t = setTimeout(() => {
      if (start && end) void calcRoute();
    }, 250);
    return () => clearTimeout(t);
  }, [JSON.stringify(start), JSON.stringify(end), JSON.stringify(waypoints)]);

  function toIsoFromLocal(input: string): string | null {
    if (!input) return null;
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  // S'assurer que le profil existe — TOUT est awaited
  const ensureProfileExists = async (): Promise<boolean> => {
    if (!currentUser || !supabase) return false;

    try {
      const { data: prof, error: selErr } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (selErr) {
        console.error("[CreateRun] Profile select error:", selErr);
        return false;
      }

      if (!prof) {
        const { error: upErr } = await supabase.from("profiles").upsert({
          id: currentUser.id,
          email: currentUser.email || "",
          full_name: currentUser.email?.split("@")[0] || "Runner",
          sessions_hosted: 0,
          sessions_joined: 0,
          total_km: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        if (upErr) {
          console.error("[CreateRun] Profile creation error:", upErr);
          alert("Impossible de créer votre profil. Reconnectez-vous puis réessayez.");
          return false;
        }
      }
      return true;
    } catch (profileError) {
      console.error("[CreateRun] Profile check error:", profileError);
      alert("Erreur lors de la vérification du profil.");
      return false;
    }
  };

  // Validation des données
  const validateSessionData = () => {
    if (!start || !end) {
      alert("Définissez un départ et une arrivée (clics sur la carte).");
      return false;
    }
    if (!dirResult) {
      alert("Impossible de calculer l'itinéraire.");
      return false;
    }
    if (!title?.trim()) {
      alert("Indiquez un titre.");
      return false;
    }
    const scheduledIso = toIsoFromLocal(dateTime);
    if (!scheduledIso) {
      alert("Date/heure invalide.");
      return false;
    }
    if (new Date(scheduledIso) <= new Date()) {
      alert("La date doit être dans le futur.");
      return false;
    }
    return { scheduledIso };
  };

  // Créer le payload d'insertion
  const createSessionPayload = (scheduledIso: string) => {
    const r = (dirResult || ({} as any)).routes?.[0];
    const legs = r?.legs ?? [];
    const meters = legs.reduce((s: number, l: any) => s + (l?.distance?.value ?? 0), 0);
    const overview = r?.overview_polyline as any;
    const poly =
      typeof overview === "string"
        ? overview
        : overview?.points ?? overview?.toString?.() ?? "";

    const startAddr = legs[0]?.start_address ?? null;
    const endAddr = legs[legs.length - 1]?.end_address ?? null;

    const sessionTypeMapping: Record<string, string> = {
      mixed: "mixed",
      women: "women_only",
      men: "men_only",
    };

    const payload: any = {
      host_id: currentUser.id,
      title: title.trim(),
      scheduled_at: scheduledIso,
      start_lat: Number(start!.lat),
      start_lng: Number(start!.lng),
      end_lat: Number(end!.lat),
      end_lng: Number(end!.lng),
      distance_km: Math.round((meters / 1000) * 100) / 100,
      route_distance_m: meters,
      route_polyline: poly || null,
      start_place: startAddr,
      end_place: endAddr,
      location_hint: startAddr
        ? String(startAddr).split(",")[0]
        : `Zone ${start!.lat.toFixed(3)}, ${start!.lng.toFixed(3)}`,
      intensity: uiToDbIntensity(intensityState),
      session_type: sessionTypeMapping[sessionTypeState] || "mixed",
      max_participants: Math.min(20, Math.max(3, Number(maxParticipantsState) || 10)),
      status: "published",
      blur_radius_m: 1000,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (description?.trim()) {
      payload.description = description.trim();
    }
    return payload;
  };

  // Post-traitement après création — pas de Promise.all avec builders
  const handlePostCreation = async (newSession: { id: string }) => {
    if (!supabase || !currentUser) return;

    try {
      // Récupérer la valeur actuelle
      const { data: currentProfile, error: profErr } = await supabase
        .from("profiles")
        .select("sessions_hosted")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (!profErr && currentProfile) {
        await supabase
          .from("profiles")
          .update({
            sessions_hosted: (currentProfile.sessions_hosted || 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", currentUser.id);
      }

      // Événements front non bloquants
      window.dispatchEvent(
        new CustomEvent("profileRefresh", {
          detail: { userId: currentUser.id, action: "session_created", sessionId: newSession.id },
        })
      );
      window.dispatchEvent(
        new CustomEvent("mapRefresh", {
          detail: { newSession, userId: currentUser.id },
        })
      );
    } catch (e) {
      console.warn("[CreateRun] Profile update after creation failed (non-blocking):", e);
    }
  };

  // Reset du formulaire
  const resetForm = () => {
    setStart(null);
    setEnd(null);
    setWaypoints([]);
    setDirResult(null);
    setDistanceKm(null);
    setTitle("");
    setDescription("");
    setDateTime("");
    setIntensityState("course modérée");
    setSessionTypeState("mixed");
    setMaxParticipantsState(10);
  };

  // Soumission — tous les appels supabase sont awaited individuellement
  async function onSubmit() {
    if (!supabase) {
      alert("Configuration Supabase manquante.");
      return;
    }
    setIsSaving(true);
    try {
      if (!currentUser) {
        alert("Veuillez vous connecter pour créer une session.");
        return;
      }

      const profileExists = await ensureProfileExists();
      if (!profileExists) return;

      const validation = validateSessionData();
      if (!validation) return;
      const { scheduledIso } = validation;

      if (!dirResult) {
        await calcRoute();
      }
      if (!dirResult) {
        alert("Impossible de calculer l'itinéraire.");
        return;
      }

      const payload = createSessionPayload(scheduledIso);

      const { data, error } = await supabase
        .from("sessions")
        .insert(payload)
        .select("id,title,scheduled_at")
        .single();

      if (error) {
        console.error("[CreateRun] Insert error:", error);
        alert(
          "Création impossible : " + (error.message || (error as any).details || "erreur inconnue")
        );
        return;
      }

      await handlePostCreation({ id: data.id });

      alert(
        `🎉 Session créée avec succès !\n\n"${data.title}"\nID: ${data.id}\n\nVous allez être redirigé vers la carte pour voir votre session.`
      );

      resetForm();

      // Navigation douce
      navigate("/map", {
        state: { newSessionId: data.id, shouldFocus: true },
      });
    } catch (e: any) {
      console.error("[CreateRun] Fatal error:", e);
      alert("Erreur lors de la création : " + (e.message || "Erreur inconnue"));
    } finally {
      setIsSaving(false);
    }
  }

  // Écrans d'état
  if (userReady === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Vérification de votre session…</p>
        </div>
      </div>
    );
  }

  if (userReady === "none") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Connexion requise</CardTitle>
            <CardDescription>Vous devez être connecté pour créer une session de running.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => navigate(`/auth?returnTo=${encodeURIComponent("/create")}`)}
              className="w-full"
            >
              Se connecter
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold gradient-primary bg-clip-text text-transparent mb-3">
            Créer une nouvelle session
          </h1>
          <p className="text-muted-foreground text-lg">
            Organisez votre prochaine sortie running en quelques clics
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  Informations générales
                </CardTitle>
                <CardDescription>Définissez les détails de votre session</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Titre de la session *</label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="ex: Course matinale au parc"
                    className="h-12 text-base"
                    maxLength={100}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Description (optionnel)</label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Décrivez votre session: niveau requis, équipements, conseils..."
                    className="min-h-[100px] text-base"
                    maxLength={500}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Date et heure *</label>
                  <DateTimePicker value={dateTime} onChange={setDateTime} placeholder="Choisir la date et l'heure" />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Route className="h-5 w-5 text-primary" />
                  Définir le parcours
                </CardTitle>
                <CardDescription>Sélectionnez vos points de départ et d'arrivée</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Point de départ *</label>
                  <LocationInput
                    value={start}
                    onChange={setStart}
                    placeholder="Saisissez l'adresse de départ"
                    icon="start"
                    onMapSelect={() => setIsSelectingLocation("start")}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Point d'arrivée *</label>
                  <LocationInput
                    value={end}
                    onChange={setEnd}
                    placeholder="Saisissez l'adresse d'arrivée"
                    icon="end"
                    onMapSelect={() => setIsSelectingLocation("end")}
                  />
                </div>

                {distanceKm && (
                  <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                    <MapPin className="h-4 w-4 text-primary" />
                    <span className="text-sm">
                      Distance calculée: <strong>{distanceKm.toFixed(2)} km</strong>
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-primary" />
                  Paramètres de la session
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Intensité</label>
                    <Select value={intensityState} onValueChange={setIntensityState}>
                      <SelectTrigger className="h-12">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="marche">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="bg-green-100 text-green-800">
                              Facile
                            </Badge>
                            Marche
                          </div>
                        </SelectItem>
                        <SelectItem value="course modérée">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                              Modéré
                            </Badge>
                            Course modérée
                          </div>
                        </SelectItem>
                        <SelectItem value="course intensive">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="bg-red-100 text-red-800">
                              Intense
                            </Badge>
                            Course intensive
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Type de session</label>
                    <Select value={sessionTypeState} onValueChange={(v: any) => setSessionTypeState(v)}>
                      <SelectTrigger className="h-12">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mixed">Mixte</SelectItem>
                        <SelectItem value="women">Femmes uniquement</SelectItem>
                        <SelectItem value="men">Hommes uniquement</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Nombre maximum de participants
                  </label>
                  <Input
                    type="number"
                    min={3}
                    max={20}
                    value={maxParticipantsState}
                    onChange={(e) => setMaxParticipantsState(Number(e.target.value || 10))}
                    className="h-12"
                  />
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              {waypoints.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setWaypoints([]);
                    if (start && end) void calcRoute(start, end, []);
                  }}
                  className="w-full"
                >
                  Supprimer les points intermédiaires ({waypoints.length})
                </Button>
              )}

              <Button
                type="button"
                onClick={onSubmit}
                disabled={!!disabledReason()}
                className="w-full h-12 text-base font-medium gradient-primary"
                size="lg"
              >
                {isSaving ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                    Création en cours...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Timer className="h-4 w-4" />
                    Créer la session
                  </div>
                )}
              </Button>

              {!!disabledReason() && (
                <div className="text-sm text-muted-foreground text-center bg-muted/50 p-3 rounded-lg">
                  <strong>Pour continuer :</strong> {disabledReason()}
                </div>
              )}
            </div>
          </div>

          <div className="lg:sticky lg:top-6">
            <Card className="shadow-card overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-primary" />
                  Carte interactive
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <GoogleMap
                  mapContainerStyle={{ width: "100%", height: "500px" }}
                  zoom={13}
                  center={start ?? center}
                  options={{
                    mapTypeControl: false,
                    streetViewControl: false,
                    fullscreenControl: false,
                  }}
                  onClick={handleMapClick}
                >
                  {start && (
                    <MarkerF
                      position={start}
                      icon={{
                        url:
                          "data:image/svg+xml;base64," +
                          btoa(`
                          <svg width="32" height="40" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M16 0C24.284 0 31 6.716 31 15C31 23.284 16 40 16 40S1 23.284 1 15C1 6.716 7.716 0 16 0Z" fill="#16a34a" stroke="white" stroke-width="2"/>
                            <circle cx="16" cy="15" r="6" fill="white"/>
                          </svg>
                        `),
                        scaledSize: new google.maps.Size(32, 40),
                        anchor: new google.maps.Point(16, 40),
                      }}
                    />
                  )}
                  {end && (
                    <MarkerF
                      position={end}
                      icon={{
                        url:
                          "data:image/svg+xml;base64," +
                          btoa(`
                          <svg width="32" height="40" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M16 0C24.284 0 31 6.716 31 15C31 23.284 16 40 16 40S1 23.284 1 15C1 6.716 7.716 0 16 0Z" fill="#dc2626" stroke="white" stroke-width="2"/>
                            <circle cx="16" cy="15" r="6" fill="white"/>
                          </svg>
                        `),
                        scaledSize: new google.maps.Size(32, 40),
                        anchor: new google.maps.Point(16, 40),
                      }}
                    />
                  )}
                  {start && end && dirResult && (
                    <DirectionsRenderer
                      directions={dirResult}
                      options={{
                        suppressMarkers: true,
                        polylineOptions: {
                          strokeColor: "#3b82f6",
                          strokeWeight: 4,
                          strokeOpacity: 0.8,
                        },
                      }}
                    />
                  )}
                </GoogleMap>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
