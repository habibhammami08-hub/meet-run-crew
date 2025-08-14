import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, Users, Clock, Star } from "lucide-react";
import heroImage from "@/assets/hero-running.jpg";
import Navigation from "@/components/Navigation";

const Home = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="relative h-[50vh] overflow-hidden">
        <img 
          src={heroImage} 
          alt="MeetRun - Running collectif" 
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
        <div className="absolute inset-0 flex flex-col justify-end p-6 text-white">
          <h1 className="text-4xl font-bold mb-2">MeetRun</h1>
          <p className="text-lg opacity-90 mb-6">L'application de running collectif</p>
          <div className="flex gap-3">
            <Button variant="sport" size="lg" className="flex-1">
              Créer un compte
            </Button>
            <Button variant="sportOutline" size="lg" className="flex-1 border-white text-white hover:bg-white hover:text-black">
              Se connecter
            </Button>
          </div>
        </div>
      </div>

      {/* How it works section */}
      <div className="p-6">
        <h2 className="text-2xl font-bold text-center mb-8 text-sport-black">
          Comment ça marche ?
        </h2>
        
        <div className="space-y-6 mb-8">
          <Card className="shadow-card">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-white font-bold text-sm">
                  1
                </div>
                <div>
                  <h3 className="font-semibold text-sport-black mb-2">Trouve ta course</h3>
                  <p className="text-sport-gray">Découvre les sessions de running près de chez toi sur la carte interactive.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-white font-bold text-sm">
                  2
                </div>
                <div>
                  <h3 className="font-semibold text-sport-black mb-2">Inscris-toi</h3>
                  <p className="text-sport-gray">Paie 4,50$ pour rejoindre une session et accéder aux détails complets.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-white font-bold text-sm">
                  3
                </div>
                <div>
                  <h3 className="font-semibold text-sport-black mb-2">Cours ensemble</h3>
                  <p className="text-sport-gray">Rejoins ton groupe au point de rendez-vous et profite de ta course !</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Featured runs */}
        <div className="mb-6">
          <h3 className="text-xl font-semibold mb-4 text-sport-black">Courses populaires</h3>
          
          <div className="space-y-4">
            <Card className="shadow-card">
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="font-semibold text-sport-black">Course matinale - Parc Central</h4>
                    <p className="text-sm text-sport-gray flex items-center gap-1">
                      <MapPin size={14} />
                      Zone approx. 10km (inscrivez-vous pour le lieu exact)
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-primary font-semibold">4,50$</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-4 text-sm text-sport-gray mb-3">
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
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Star size={14} className="text-yellow-500 fill-current" />
                    <span className="text-sm text-sport-gray">4.8 (12 avis)</span>
                  </div>
                  <Button variant="sport" size="sm">
                    Rejoindre
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="font-semibold text-sport-black">Course urbaine - Centre-ville</h4>
                    <p className="text-sm text-sport-gray flex items-center gap-1">
                      <MapPin size={14} />
                      Zone approx. 10km (inscrivez-vous pour le lieu exact)
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-primary font-semibold">4,50$</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-4 text-sm text-sport-gray mb-3">
                  <span className="flex items-center gap-1">
                    <Clock size={14} />
                    Aujourd'hui 18h00
                  </span>
                  <span className="flex items-center gap-1">
                    <Users size={14} />
                    3/6 coureurs
                  </span>
                  <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded-full text-xs">
                    Élevée
                  </span>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Star size={14} className="text-yellow-500 fill-current" />
                    <span className="text-sm text-sport-gray">4.9 (8 avis)</span>
                  </div>
                  <Button variant="sport" size="sm">
                    Rejoindre
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Button variant="sportSecondary" size="lg" className="w-full">
          Voir toutes les courses
        </Button>
      </div>

      <Navigation />
    </div>
  );
};

export default Home;