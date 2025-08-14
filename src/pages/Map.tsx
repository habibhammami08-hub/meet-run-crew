import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Header from "@/components/Header";
import Navigation from "@/components/Navigation";
import { Filter, MapPin, Users, Clock } from "lucide-react";
import { useState } from "react";

const Map = () => {
  const [selectedRun, setSelectedRun] = useState(null);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header 
        title="Carte des courses"
        actions={
          <Button variant="ghost" size="icon">
            <Filter size={20} />
          </Button>
        }
      />
      
      {/* Map placeholder */}
      <div className="flex-1 relative bg-gray-100">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center p-6 bg-white rounded-lg shadow-card m-6">
            <MapPin size={48} className="mx-auto mb-4 text-primary" />
            <h3 className="text-lg font-semibold mb-2">Carte interactive</h3>
            <p className="text-sport-gray mb-4">
              Connectez Supabase pour activer la géolocalisation et voir les courses proches de vous
            </p>
            <Button variant="sport">
              Voir les instructions
            </Button>
          </div>
        </div>
        
        {/* Sample markers overlay */}
        <div className="absolute top-1/4 left-1/3 w-4 h-4 bg-primary rounded-full animate-pulse-sport cursor-pointer"
             onClick={() => setSelectedRun(1)} />
        <div className="absolute top-2/3 right-1/4 w-4 h-4 bg-primary rounded-full animate-pulse-sport cursor-pointer"
             onClick={() => setSelectedRun(2)} />
        <div className="absolute bottom-1/4 left-1/2 w-4 h-4 bg-primary rounded-full animate-pulse-sport cursor-pointer"
             onClick={() => setSelectedRun(3)} />
      </div>

      {/* Filter bar */}
      <div className="p-4 bg-white border-t border-border">
        <div className="flex gap-2 overflow-x-auto">
          <Button variant="sport" size="sm">Toutes</Button>
          <Button variant="sportSecondary" size="sm">5km</Button>
          <Button variant="sportSecondary" size="sm">10km</Button>
          <Button variant="sportSecondary" size="sm">Mixte</Button>
          <Button variant="sportSecondary" size="sm">Femmes</Button>
          <Button variant="sportSecondary" size="sm">Faible</Button>
          <Button variant="sportSecondary" size="sm">Moyenne</Button>
          <Button variant="sportSecondary" size="sm">Élevée</Button>
        </div>
      </div>

      {/* Selected run details */}
      {selectedRun && (
        <div className="p-4 bg-white border-t border-border">
          <Card className="shadow-card">
            <CardContent className="p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h4 className="font-semibold text-sport-black">Course matinale - Parc Central</h4>
                  <p className="text-sm text-sport-gray flex items-center gap-1">
                    <MapPin size={14} />
                    Zone approx. 10km (inscrivez-vous pour voir le lieu exact)
                  </p>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setSelectedRun(null)}
                >
                  ✕
                </Button>
              </div>
              
              <div className="flex items-center gap-4 text-sm text-sport-gray mb-4">
                <span className="flex items-center gap-1">
                  <Clock size={14} />
                  Demain 7h30
                </span>
                <span className="flex items-center gap-1">
                  <Users size={14} />
                  5/8 coureurs
                </span>
                <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs">
                  Moyenne
                </span>
              </div>
              
              <div className="flex gap-3">
                <Button variant="sportOutline" size="sm" className="flex-1">
                  Voir détails
                </Button>
                <Button variant="sport" size="sm" className="flex-1">
                  Rejoindre - 4,50$
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Navigation />
    </div>
  );
};

export default Map;