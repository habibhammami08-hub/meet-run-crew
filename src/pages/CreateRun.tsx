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
import { getSupabase } from "@/integrations/supabase/client";
import GoogleMapProvider from "@/components/Map/GoogleMapProvider";
import { Calendar, Clock, MapPin, Users, Loader2 } from "lucide-react";
import { uiToDbIntensity } from "@/lib/sessions/intensity";

type Pt = google.maps.LatLngLiteral;

export default function CreateRun() {
  const { user } = useAuth();
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

  // Redirect if not authenticated
  useEffect(() => {
    if (!user) {
      navigate("/auth");
    }
  }, [user, navigate]);

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

  const onSubmit = async () => {
    if (!supabase) {
      toast({
        title: "Erreur",
        description: "Configuration Supabase manquante.",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsSaving(true);

      // 1) Auth & RLS
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      if (!user) {
        toast({
          title: "Erreur",
          description: "Vous devez être connecté pour créer une session.",
          variant: "destructive"
        });
        navigate("/auth");
        return;
      }

      // 2) Préconditions
      if (!start || !end) {
        toast({
          title: "Erreur",
          description: "Sélectionnez un point de départ et d'arrivée.",
          variant: "destructive"
        });
        return;
      }
      if (!dirResult) {
        toast({
          title: "Erreur",
          description: "Aucun itinéraire calculé. Définissez ou ajustez l'itinéraire avant de créer la session.",
          variant: "destructive"
        });
        return;
      }

      // 3) Validation des champs requis
      const title = formData.title?.trim() || "";
      const scheduledAt = formData.scheduled_at;
      const intensity = formData.intensity;
      const sessionType = formData.session_type;

      if (!title) {
        toast({
          title: "Erreur",
          description: "Le titre est obligatoire.",
          variant: "destructive"
        });
        return;
      }

      if (!scheduledAt) {
        toast({
          title: "Erreur",
          description: "La date et l'heure sont obligatoires.",
          variant: "destructive"
        });
        return;
      }

      if (!intensity) {
        toast({
          title: "Erreur", 
          description: "L'intensité est obligatoire.",
          variant: "destructive"
        });
        return;
      }

      if (!sessionType) {
        toast({
          title: "Erreur",
          description: "Le type de session est obligatoire.",
          variant: "destructive"
        });
        return;
      }

      // 4) Extraire distance & polyline depuis Directions
      const route = dirResult.routes?.[0];
      const legs = route?.legs ?? [];
      const meters = legs.reduce((sum, l) => sum + (l.distance?.value ?? 0), 0);
      const polyline =
        route?.overview_polyline?.toString?.() ??
        (route?.overview_polyline as any)?.points ??
        "";
      const startAddr = legs[0]?.start_address ?? null;
      const endAddr = legs[legs.length - 1]?.end_address ?? null;

      // 5) Construire payload pour respecter le schéma
      const payload = {
        host_id: user.id,                // RLS: requis
        title,
        description: formData.description || null,
        scheduled_at: new Date(scheduledAt).toISOString(),
        start_lat: start.lat,
        start_lng: start.lng,
        end_lat: end.lat,
        end_lng: end.lng,
        distance_km: meters / 1000,
        route_distance_m: meters,
        route_polyline: polyline,
        start_place: startAddr,
        end_place: endAddr,
        intensity: uiToDbIntensity(intensity),
        session_type: sessionType,
        max_participants: formData.max_participants || 10,
        status: "published",
        // NE PAS inclure de prix: trigger DB force 450 cents / EUR
      };

      // 6) Insert Supabase
      const { error } = await supabase.from("sessions").insert(payload);
      if (error) {
        console.error("[sessions.insert]", { payload, error });
        toast({
          title: "Erreur",
          description: "Création impossible: " + (error.message || "erreur inconnue"),
          variant: "destructive"
        });
        return;
      }

      // 7) Succès
      toast({
        title: "Session créée 🎉",
        description: "Votre session de course a été créée avec succès"
      });
      
      // Reset minimal et navigation
      setStart(null);
      setEnd(null);
      setWaypoints([]);
      setDirResult(null);
      setFormData({
        title: "",
        description: "",
        scheduled_at: "",
        intensity: "",
        session_type: "",
        max_participants: 10
      });
      navigate("/");
    } catch (e: any) {
      console.error("[create-session]", e);
      toast({
        title: "Erreur",
        description: "Erreur lors de la création de la session. Veuillez réessayer.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!user) return null;

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
                      value={formData.title}
                      onChange={(e) => handleInputChange("title", e.target.value)}
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
                      value={formData.scheduled_at}
                      onChange={(e) => handleInputChange("scheduled_at", e.target.value)}
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
                    <Select value={formData.intensity} onValueChange={(value) => handleInputChange("intensity", value)}>
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
                    <Select value={formData.session_type} onValueChange={(value) => handleInputChange("session_type", value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionnez le type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mixed">Mixte</SelectItem>
                        <SelectItem value="men_only">Hommes uniquement</SelectItem>
                        <SelectItem value="women_only">Femmes uniquement</SelectItem>
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
                      value={formData.max_participants}
                      onChange={(e) => handleInputChange("max_participants", parseInt(e.target.value))}
                      min="2"
                      max="50"
                    />
                  </div>
                </CardContent>
              </Card>

              <Button
                onClick={onSubmit}
                disabled={isSaving || !start || !end || !dirResult || !formData.title || !formData.scheduled_at || !formData.intensity || !formData.session_type}
                className="w-full"
                size="lg"
              >
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSaving ? "Création en cours..." : "Créer la session"}
              </Button>
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
                        onDirectionsChanged={() => onDirectionsChanged}
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