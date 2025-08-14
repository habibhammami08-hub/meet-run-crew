import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Header from "@/components/Header";
import Navigation from "@/components/Navigation";
import { Calendar, Clock, MapPin, Users, TrendingUp } from "lucide-react";

const CreateRun = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header title="Créer une session" />
      
      <div className="p-4 space-y-6 pb-20">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin size={20} />
              Lieu de rendez-vous
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="address">Adresse exacte</Label>
              <Input 
                id="address"
                placeholder="123 Rue du Parc, Montréal, QC"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="description">Description du lieu</Label>
              <Textarea 
                id="description"
                placeholder="Point de rendez-vous près de l'entrée principale du parc..."
                className="mt-1"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar size={20} />
              Date et heure
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="date">Date</Label>
              <Input 
                id="date"
                type="date"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="time">Heure de départ</Label>
              <Input 
                id="time"
                type="time"
                className="mt-1"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp size={20} />
              Détails de la course
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="distance">Distance (km)</Label>
              <Select>
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
              <Label htmlFor="intensity">Intensité</Label>
              <Select>
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
              <Label htmlFor="type">Type de course</Label>
              <Select>
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

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users size={20} />
              Participants
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div>
              <Label htmlFor="max-participants">Nombre maximum de participants</Label>
              <Select>
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
                  <SelectItem value="11">11 participants</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg">Description additionnelle</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea 
              placeholder="Ajoutez des détails sur le parcours, le niveau recommandé, les points d'intérêt..."
              rows={4}
            />
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Button variant="sport" size="lg" className="w-full">
            Créer la session de running
          </Button>
          <p className="text-center text-sm text-sport-gray">
            Votre session sera visible sur la carte une fois validée
          </p>
        </div>
      </div>

      <Navigation />
    </div>
  );
};

export default CreateRun;