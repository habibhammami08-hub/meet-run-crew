import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import Header from "@/components/Header";
import Navigation from "@/components/Navigation";
import { MapPin, Users, Clock, Star, TrendingUp, Calendar } from "lucide-react";

const RunDetails = () => {
  const isRegistered = false; // This would come from your auth state

  return (
    <div className="min-h-screen bg-background">
      <Header title="Détails de la course" />
      
      <div className="p-4 space-y-6 pb-20">
        {/* Main run info */}
        <Card className="shadow-card">
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h1 className="text-xl font-bold text-sport-black mb-2">Course matinale - Parc Central</h1>
                <p className="text-sport-gray flex items-center gap-1">
                  <MapPin size={16} />
                  {isRegistered ? "123 Rue du Parc, Montréal" : "Zone approx. 10km (inscrivez-vous pour voir l'adresse exacte)"}
                </p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-primary">4,50$</span>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-sport-gray" />
                <div>
                  <p className="text-sm font-medium">Date</p>
                  <p className="text-sm text-sport-gray">Demain, 15 mars</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-sport-gray" />
                <div>
                  <p className="text-sm font-medium">Heure</p>
                  <p className="text-sm text-sport-gray">7h30 - 8h30</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp size={16} className="text-sport-gray" />
                <div>
                  <p className="text-sm font-medium">Distance</p>
                  <p className="text-sm text-sport-gray">8 km</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Users size={16} className="text-sport-gray" />
                <div>
                  <p className="text-sm font-medium">Participants</p>
                  <p className="text-sm text-sport-gray">5/8 coureurs</p>
                </div>
              </div>
            </div>

            <div className="flex gap-2 mb-4">
              <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm">
                Intensité Moyenne
              </span>
              <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                Mixte
              </span>
            </div>

            <div className="flex items-center gap-2 mb-6">
              <Star size={16} className="text-yellow-500 fill-current" />
              <span className="font-medium">4.8</span>
              <span className="text-sport-gray">(12 avis)</span>
            </div>

            {!isRegistered ? (
              <Button variant="sport" size="lg" className="w-full">
                S'inscrire à cette session - 4,50$
              </Button>
            ) : (
              <div className="space-y-3">
                <Button variant="sport" size="lg" className="w-full">
                  Course confirmée ✓
                </Button>
                <Button variant="sportOutline" size="sm" className="w-full">
                  Annuler l'inscription
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Organizer info */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg">Organisateur</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarFallback>SM</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">Sarah Martin</p>
                <p className="text-sm text-sport-gray">Organisatrice depuis 2 ans</p>
                <div className="flex items-center gap-1 mt-1">
                  <Star size={14} className="text-yellow-500 fill-current" />
                  <span className="text-sm">4.9 (45 courses)</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Participants */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg">Participants</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {isRegistered ? (
                // Full participant list when registered
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarFallback>JD</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">Julie Dubois</p>
                        <p className="text-sm text-sport-gray">Confirmée</p>
                      </div>
                    </div>
                    <span className="text-green-600 font-medium">✓</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarFallback>ML</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">Marc Lavoie</p>
                        <p className="text-sm text-sport-gray">Confirmé</p>
                      </div>
                    </div>
                    <span className="text-green-600 font-medium">✓</span>
                  </div>
                </>
              ) : (
                // Limited info when not registered
                <>
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback>?</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">Femme, 28 ans</p>
                      <p className="text-sm text-sport-gray">Confirmée</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback>?</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">Homme, 32 ans</p>
                      <p className="text-sm text-sport-gray">Confirmé</p>
                    </div>
                  </div>
                  <div className="text-center py-4">
                    <p className="text-sport-gray text-sm">
                      Inscrivez-vous pour voir les noms et photos des participants
                    </p>
                  </div>
                </>
              )}
              
              <div className="text-center text-sport-gray text-sm mt-4">
                {isRegistered ? "5 participants confirmés" : "5 participants (détails limités)"}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Description */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg">Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sport-gray">
              Course matinale dans le magnifique Parc Central. Parcours varié avec quelques 
              montées pour un défi modéré. Parfait pour commencer la journée en forme ! 
              Nous nous retrouvons au point de rendez-vous puis partons ensemble.
            </p>
          </CardContent>
        </Card>
      </div>

      <Navigation />
    </div>
  );
};

export default RunDetails;