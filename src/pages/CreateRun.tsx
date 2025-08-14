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
    description: ''
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
    setSelectedLocations(prev => ({
      ...prev,
      [type]: { lat, lng }
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Basic validation
      if (!formData.title || !formData.date || !formData.time || !formData.area_hint) {
        throw new Error('Veuillez remplir tous les champs obligatoires');
      }

      if (!formData.distance_km || !formData.intensity || !formData.type || !formData.max_participants) {
        throw new Error('Veuillez sélectionner tous les détails de la course');
      }

      // Validate start location is selected (obligatoire)
      if (!selectedLocations.start) {
        throw new Error('Veuillez sélectionner un point de départ sur la carte - c\'est obligatoire !');
      }
      
      // Combine date and time
      const sessionDateTime = new Date(`${formData.date}T${formData.time}`);
      
      const sessionData = {
        title: formData.title,
        date: sessionDateTime.toISOString(),
        location_lat: parseFloat(selectedLocations.start.lat.toString()),
        location_lng: parseFloat(selectedLocations.start.lng.toString()),
        end_lat: selectedLocations.end ? parseFloat(selectedLocations.end.lat.toString()) : null,
        end_lng: selectedLocations.end ? parseFloat(selectedLocations.end.lng.toString()) : null,
        area_hint: formData.area_hint,
        distance_km: parseFloat(formData.distance_km),
        intensity: formData.intensity,
        type: formData.type,
        max_participants: parseInt(formData.max_participants),
        host_id: user.id,
      };

      const { data: newSession, error } = await supabase
        .from('sessions')
        .insert(sessionData)
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Session créée avec succès !",
        description: "Votre session apparaît maintenant sur la carte.",
      });

      // Navigate to map with session coordinates in URL params for centering
      navigate(`/map?lat=${selectedLocations.start.lat}&lng=${selectedLocations.start.lng}&sessionId=${newSession.id}`);
      
    } catch (error: any) {
      toast({
        title: "Erreur lors de la création",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header title="Créer une session" />
      
      <form onSubmit={handleSubmit} className="p-4 space-y-6">
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
              />
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
                className="w-full mt-2 flex items-center gap-2"
              >
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                {selectedLocations.start 
                  ? `Départ sélectionné: ${selectedLocations.start.lat.toFixed(4)}, ${selectedLocations.start.lng.toFixed(4)}`
                  : 'Choisir le point de départ'
                }
              </Button>
            </div>

            {/* Point d'arrivée */}
            <div>
              <Label>Point d'arrivée (optionnel)</Label>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setMode('end');
                  setShowLocationPicker(true);
                }}
                className="w-full mt-2 flex items-center gap-2"
              >
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                {selectedLocations.end 
                  ? `Arrivée sélectionnée: ${selectedLocations.end.lat.toFixed(4)}, ${selectedLocations.end.lng.toFixed(4)}`
                  : 'Choisir le point d\'arrivée'
                }
              </Button>
              <p className="text-sm text-muted-foreground mt-1">
                Si aucun point d'arrivée n'est spécifié, la course sera un aller-retour au point de départ.
              </p>
            </div>
            
            <div>
              <Label htmlFor="area_hint">Description du lieu *</Label>
              <Textarea 
                id="area_hint"
                value={formData.area_hint}
                onChange={(e) => handleInputChange('area_hint', e.target.value)}
                placeholder="Point de rendez-vous près de l'entrée principale du parc..."
                className="mt-1"
                required
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
                <SelectContent>
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
                <SelectContent>
                  <SelectItem value="low">Faible - Rythme tranquille</SelectItem>
                  <SelectItem value="medium">Moyenne - Rythme modéré</SelectItem>
                  <SelectItem value="high">Élevée - Rythme soutenu</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="type">Type de course *</Label>
              <Select value={formData.type} onValueChange={(value) => handleInputChange('type', value)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Sélectionner le type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mixed">Mixte</SelectItem>
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
                <SelectContent>
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
            disabled={loading}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Créer la session de running
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