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
      console.error("[create] No supabase client");
      alert("Configuration Supabase manquante."); 
      return; 
    }

    try {
      setIsSaving(true);
      console.info("[create] Submit clicked", { 
        start, 
        end, 
        hasDir: !!dirResult, 
        formData,
        title: formData.title,
        scheduled_at: formData.scheduled_at 
      });

      // Auth pour RLS
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr) {
        console.error("[create] Auth error", authErr);
        throw authErr;
      }
      if (!user) { 
        console.error("[create] No user");
        alert("Vous devez être connecté."); 
        return; 
      }
      console.info("[create] User authenticated", user.id);

      // Préconditions
      if (!start || !end) { 
        console.error("[create] Missing start/end", { start, end });
        alert("Sélectionnez un départ et une arrivée."); 
        return; 
      }
      if (!dirResult) { 
        console.error("[create] Missing directions");
        alert("Calculez l'itinéraire avant de créer la session."); 
        return; 
      }
      if (!formData.title?.trim()) { 
        console.error("[create] Missing title");
        alert("Indiquez un titre."); 
        return; 
      }
      if (!formData.scheduled_at) { 
        console.error("[create] Missing scheduled_at");
        alert("Choisissez la date et l'heure."); 
        return; 
      }
      if (!formData.intensity) { 
        console.error("[create] Missing intensity");
        alert("Choisissez l'intensité."); 
        return; 
      }
      if (!formData.session_type) { 
        console.error("[create] Missing session_type");
        alert("Choisissez le type de session."); 
        return; 
      }

      console.info("[create] All preconditions OK");

      // Distance / polyline
      const route = dirResult.routes?.[0];
      const legs = route?.legs ?? [];
      const meters = legs.reduce((s, l) => s + (l.distance?.value ?? 0), 0);
      const polyline = route?.overview_polyline?.toString?.() ?? (route?.overview_polyline as any)?.points ?? "";
      const startAddr = legs[0]?.start_address ?? null;
      const endAddr = legs[legs.length - 1]?.end_address ?? null;

      console.info("[create] Route data", { meters, polyline: polyline.length, startAddr, endAddr });

      // scheduled_at depuis l'input datetime-local (TZ locale)
      const scheduledIso = new Date(formData.scheduled_at).toISOString();

      // Payload conforme schéma/RLS
      const payload = {
        host_id: user.id,
        title: formData.title.trim(),
        description: formData.description || null,
        scheduled_at: scheduledIso,
        start_lat: start.lat, 
        start_lng: start.lng,
        end_lat: end.lat, 
        end_lng: end.lng,
        distance_km: meters / 1000,
        route_distance_m: meters,
        route_polyline: polyline,
        start_place: startAddr, 
        end_place: endAddr,
        intensity: uiToDbIntensity(formData.intensity),
        session_type: formData.session_type,
        max_participants: Number(formData.max_participants) || 10,
        status: "published",
      };

      console.info("[create] Inserting session", payload);

      const { data, error } = await supabase.from("sessions").insert(payload).select();
      if (error) {
        console.error("[sessions.insert] ERROR", { payload, error });
        alert("Création impossible : " + (error.message || "erreur inconnue"));
        return;
      }

      console.info("[create] Insert OK", data);
      toast({
        title: "Session créée 🎉",
        description: "Votre session de course a été créée avec succès"
      });
      
      // Reset minimal et navigation
      setStart(null);
      setEnd(null);
      setWaypoints([]);
      setDirResult(null);
      setDistanceKm(null);
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
      console.error("[create] Fatal error", e);
      toast({
        title: "Erreur",
        description: "Erreur lors de la création. Vérifiez les champs et réessayez.",
        variant: "destructive"
      });
    } finally {
      console.info("[create] Finally - setting saving to false");
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
                type="button"
                onClick={onSubmit}
                disabled={isSaving || !start || !end || !dirResult || !formData.title?.trim() || !formData.scheduled_at || !formData.intensity || !formData.session_type}
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