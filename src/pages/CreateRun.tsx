import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Header from "@/components/Header";
import LocationPicker from "@/components/LocationPicker";
import { Calendar, Clock, MapPin, Users, TrendingUp, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const CreateRun = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [mode, setMode] = useState<'start' | 'end'>('start');
  const [selectedLocations, setSelectedLocations] = useState<{
    start?: { lat: number; lng: number };
    end?: { lat: number; lng: number };
  }>({});
  const [formData, setFormData] = useState({
    title: '',
    date: '',
    time: '',
    area_hint: '',
    distance_km: '',
    intensity: '',
    type: '',
    max_participants: '',
  });

  // Redirect to auth if not logged in
  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Header title="Créer une session" />
        
        <div className="p-4 pt-20">
          <Card className="shadow-card">
            <CardContent className="p-8 text-center">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Users size={32} className="text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Connexion requise</h2>
              <p className="text-muted-foreground mb-8">
                Vous devez être connecté pour créer une session de course.
              </p>
              <Button 
                variant="sport" 
                size="lg" 
                onClick={() => navigate("/auth")}
              >
                Se connecter
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const handleInputChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleLocationSelect = (lat: number, lng: number, type: 'start' | 'end') => {
    console.log(`Sélection ${type}:`, { lat, lng });
    setSelectedLocations(prev => ({
      ...prev,
      [type]: { lat, lng }
    }));
  };

  // Validation stricte des données
  const validateFormData = () => {
    const errors: string[] = [];

    if (!formData.title?.trim()) errors.push("Le titre est obligatoire");
    if (!formData.date) errors.push("La date est obligatoire");
    if (!formData.time) errors.push("L'heure est obligatoire");
    if (!formData.area_hint?.trim()) errors.push("La description du lieu est obligatoire");
    if (!formData.distance_km) errors.push("La distance est obligatoire");
    if (!formData.intensity) errors.push("L'intensité est obligatoire");
    if (!formData.type) errors.push("Le type de course est obligatoire");
    if (!formData.max_participants) errors.push("Le nombre de participants est obligatoire");
    
    // CORRECTION: Point d'arrivée maintenant OBLIGATOIRE
    if (!selectedLocations.start) {
      errors.push("Le point de départ est obligatoire");
    }
    if (!selectedLocations.end) {
      errors.push("Le point d'arrivée est obligatoire");
    }

    // Validation de la date/heure
    if (formData.date && formData.time) {
      const sessionDateTime = new Date(`${formData.date}T${formData.time}`);
      if (isNaN(sessionDateTime.getTime())) {
        errors.push("Date/heure invalide");
      } else if (sessionDateTime <= new Date()) {
        errors.push("La session doit être dans le futur");
      }
    }

    // Validation des coordonnées
    if (selectedLocations.start) {
      const { lat, lng } = selectedLocations.start;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        errors.push("Coordonnées de départ invalides");
      }
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        errors.push("Coordonnées de départ hors limites");
      }
    }

    if (selectedLocations.end) {
      const { lat, lng } = selectedLocations.end;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        errors.push("Coordonnées d'arrivée invalides");
      }
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        errors.push("Coordonnées d'arrivée hors limites");
      }
    }

    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validation stricte
      const validationErrors = validateFormData();
      if (validationErrors.length > 0) {
        throw new Error(validationErrors[0]);
      }

      // Construction sécurisée de la date
      const sessionDateTime = new Date(`${formData.date}T${formData.time}`);
      
      // FIXE: Validation que selectedLocations existe
      if (!selectedLocations.start) {
        throw new Error("Le point de départ est obligatoire");
      }

      // Construction du payload avec validation
      const payload = {
        host_id: user.id,
        title: formData.title.trim(),
        date: sessionDateTime.toISOString(), // Utilise 'date' pour la compatibilité
        scheduled_at: sessionDateTime.toISOString(), // FIXE: Ajouter scheduled_at aussi
        distance_km: Number(formData.distance_km),
        intensity: formData.intensity,
        type: formData.type, // Utilise 'type' pour la compatibilité
        session_type: formData.type as 'mixed' | 'women_only' | 'men_only',
        max_participants: Number(formData.max_participants),
        min_participants: 2, // FIXE: Valeur par défaut
        start_lat: Number(selectedLocations.start.lat),
        start_lng: Number(selectedLocations.start.lng),
        end_lat: selectedLocations.end ? Number(selectedLocations.end.lat) : null,
        end_lng: selectedLocations.end ? Number(selectedLocations.end.lng) : null,
        area_hint: formData.area_hint.trim(),
        location_hint: formData.area_hint.trim(),
        blur_radius_m: 1000,
        price_cents: 0,
        host_fee_cents: 0,
        duration_minutes: 60, // FIXE: Valeur par défaut
        status: 'published' as const
      };

      console.log("[sessions] Création avec payload:", payload);

      const { data, error } = await supabase
        .from("sessions")
        .insert(payload)
        .select()
        .single();

      if (error) {
        console.error("[sessions] Erreur création:", error);
        throw new Error(`Impossible de créer la session: ${error.message}`);
      }

      if (!data) {
        throw new Error("Aucune donnée retournée après création");
      }

      console.log("[sessions] Session créée avec succès:", data);

      toast({
        title: "Session créée !",
        description: "Votre session apparaît maintenant sur la carte.",
      });

      // Navigation vers la carte avec la nouvelle session
      navigate(`/map?lat=${selectedLocations.start.lat}&lng=${selectedLocations.start.lng}&sessionId=${data.id}`);
      
    } catch (error: any) {
      console.error("[sessions] Erreur:", error);
      toast({
        title: "Erreur lors de la création",
        description: error.message || "Une erreur inattendue s'est produite",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header title="Créer une session" />
      
      <form onSubmit={handleSubmit} className="p-4 space-y-6 main-content">
        {/* Basic Info */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg">Informations générales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="title">Titre de la session *</Label>
              <Input 
                id="title"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder="Course matinale au parc"
                className="mt-1"
                required
                maxLength={100}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Soyez descriptif pour attirer les participants
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Location Selection */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin size={20} />
              Points de course
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Point de départ */}
            <div>
              <Label>Point de départ *</Label>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setMode('start');
                  setShowLocationPicker(true);
                }}
                className="w-full mt-2 flex items-center gap-2 h-auto py-3"
              >
                <div className="w-3 h-3 bg-green-500 rounded-full flex-shrink-0"></div>
                <div className="text-left">
                  {selectedLocations.start 
                    ? (
                      <>
                        <div className="font-medium">Point de départ sélectionné</div>
                        <div className="text-xs text-muted-foreground">
                          {selectedLocations.start.lat.toFixed(4)}, {selectedLocations.start.lng.toFixed(4)}
                        </div>
                      </>
                    )
                    : 'Choisir le point de départ'
                  }
                </div>
              </Button>
            </div>

            {/* Point d'arrivée - MAINTENANT OBLIGATOIRE */}
            <div>
              <Label>Point d'arrivée *</Label>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setMode('end');
                  setShowLocationPicker(true);
                }}
                className="w-full mt-2 flex items-center gap-2 h-auto py-3"
              >
                <div className="w-3 h-3 bg-red-500 rounded-full flex-shrink-0"></div>
                <div className="text-left">
                  {selectedLocations.end 
                    ? (
                      <>
                        <div className="font-medium">Point d'arrivée sélectionné</div>
                        <div className="text-xs text-muted-foreground">
                          {selectedLocations.end.lat.toFixed(4)}, {selectedLocations.end.lng.toFixed(4)}
                        </div>
                      </>
                    )
                    : 'Choisir le point d\'arrivée'
                  }
                </div>
              </Button>
              <p className="text-sm text-muted-foreground mt-1">
                Le point d'arrivée est maintenant obligatoire pour créer des parcours complets.
              </p>
            </div>
            
            <div>
              <Label htmlFor="area_hint">Description du lieu *</Label>
              <Textarea 
                id="area_hint"
                value={formData.area_hint}
                onChange={(e) => handleInputChange('area_hint', e.target.value)}
                placeholder="Point de rendez-vous près de l'entrée principale du parc, devant la fontaine..."
                className="mt-1"
                required
                maxLength={500}
              />
              <p className="text-sm text-muted-foreground mt-1">
                Cette description sera visible après inscription. Le lieu exact sera révélé sur la carte.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Date and Time */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar size={20} />
              Date et heure
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="date">Date *</Label>
              <Input 
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => handleInputChange('date', e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="mt-1"
                required
              />
            </div>
            <div>
              <Label htmlFor="time">Heure de départ *</Label>
              <Input 
                id="time"
                type="time"
                value={formData.time}
                onChange={(e) => handleInputChange('time', e.target.value)}
                className="mt-1"
                required
              />
            </div>
          </CardContent>
        </Card>

        {/* Run Details */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp size={20} />
              Détails de la course
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="distance">Distance (km) *</Label>
              <Select value={formData.distance_km} onValueChange={(value) => handleInputChange('distance_km', value)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Sélectionner la distance" />
                </SelectTrigger>
                <SelectContent className="bg-background border z-50">
                  <SelectItem value="3">3 km</SelectItem>
                  <SelectItem value="5">5 km</SelectItem>
                  <SelectItem value="8">8 km</SelectItem>
                  <SelectItem value="10">10 km</SelectItem>
                  <SelectItem value="15">15 km</SelectItem>
                  <SelectItem value="20">20 km</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="intensity">Intensité *</Label>
              <Select value={formData.intensity} onValueChange={(value) => handleInputChange('intensity', value)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Sélectionner l'intensité" />
                </SelectTrigger>
                <SelectContent className="bg-background border z-50">
                  <SelectItem value="low">Faible - Rythme tranquille (6-7 min/km)</SelectItem>
                  <SelectItem value="medium">Moyenne - Rythme modéré (5-6 min/km)</SelectItem>
                  <SelectItem value="high">Élevée - Rythme soutenu (4-5 min/km)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="type">Type de course *</Label>
              <Select value={formData.type} onValueChange={(value) => handleInputChange('type', value)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Sélectionner le type" />
                </SelectTrigger>
                <SelectContent className="bg-background border z-50">
                  <SelectItem value="mixed">Mixte - Ouvert à tous</SelectItem>
                  <SelectItem value="women">Femmes uniquement</SelectItem>
                  <SelectItem value="men">Hommes uniquement</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Participants */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users size={20} />
              Participants
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div>
              <Label htmlFor="max-participants">Nombre maximum de participants *</Label>
              <Select value={formData.max_participants} onValueChange={(value) => handleInputChange('max_participants', value)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Sélectionner le nombre max" />
                </SelectTrigger>
                <SelectContent className="bg-background border z-50">
                  <SelectItem value="3">3 participants</SelectItem>
                  <SelectItem value="4">4 participants</SelectItem>
                  <SelectItem value="5">5 participants</SelectItem>
                  <SelectItem value="6">6 participants</SelectItem>
                  <SelectItem value="7">7 participants</SelectItem>
                  <SelectItem value="8">8 participants</SelectItem>
                  <SelectItem value="9">9 participants</SelectItem>
                  <SelectItem value="10">10 participants</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground mt-1">
                Inclut vous-même en tant qu'organisateur
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="space-y-3">
          <Button 
            type="submit" 
            variant="sport" 
            size="lg" 
            className="w-full" 
            disabled={loading || !selectedLocations.start || !selectedLocations.end}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {loading ? "Création en cours..." : "Créer la session de running"}
          </Button>
          <p className="text-center text-sm text-sport-gray">
            Votre session sera visible sur la carte une fois créée
          </p>
        </div>
      </form>

      {/* Location Picker Modal */}
      {showLocationPicker && (
        <LocationPicker
          onLocationSelect={handleLocationSelect}
          selectedStart={selectedLocations.start}
          selectedEnd={selectedLocations.end}
          initialMode={mode}
          onClose={() => setShowLocationPicker(false)}
        />
      )}
    </div>
  );
};

export default CreateRun;