import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, Users, Shield, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import Navigation from "@/components/Navigation";
import heroImage from "@/assets/hero-running.jpg";

const Home = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-white border-b border-border px-4 py-3">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <h1 className="text-xl font-bold text-primary">MeetRun</h1>
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <Button variant="ghost" onClick={() => navigate("/profile")}>
                  Profil
                </Button>
                <Button variant="ghost" onClick={signOut}>
                  Déconnexion
                </Button>
              </>
            ) : (
              <Button variant="sport" onClick={() => navigate("/auth")}>
                Se connecter
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="relative h-[50vh] overflow-hidden">
        <img 
          src={heroImage} 
          alt="MeetRun - Running collectif" 
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
        <div className="absolute inset-0 flex flex-col justify-center items-center text-white p-6">
          <h1 className="text-4xl font-bold mb-2 text-center">MeetRun</h1>
          <p className="text-lg opacity-90 mb-6 text-center">L'application de running collectif à Wellington</p>
          <div className="flex flex-col sm:flex-row gap-4">
            {user ? (
              <>
                <Button variant="sport" size="lg" onClick={() => navigate("/map")}>
                  Voir les courses
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <Button variant="sportOutline" size="lg" onClick={() => navigate("/create")}>
                  Créer une course
                </Button>
              </>
            ) : (
              <>
                <Button variant="sport" size="lg" onClick={() => navigate("/auth")}>
                  Créer un compte
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <Button variant="sportOutline" size="lg" onClick={() => navigate("/map")}>
                  Voir les courses
                </Button>
              </>
            )}
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

        <Button variant="sportSecondary" size="lg" className="w-full" onClick={() => navigate("/map")}>
          Voir toutes les courses
        </Button>
      </div>

      <Navigation />
    </div>
  );
};

export default Home;