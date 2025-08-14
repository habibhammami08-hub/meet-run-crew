import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import Header from "@/components/Header";
import Navigation from "@/components/Navigation";
import { Edit, MapPin, Calendar, Users, Star, Award } from "lucide-react";

const Profile = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header 
        title="Profil"
        actions={
          <Button variant="ghost" size="icon">
            <Edit size={20} />
          </Button>
        }
      />
      
      <div className="p-4 space-y-6 pb-20">
        {/* User info */}
        <Card className="shadow-card">
          <CardContent className="p-6">
            <div className="flex items-start gap-4 mb-4">
              <Avatar className="w-20 h-20">
                <AvatarFallback className="text-lg">JD</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h1 className="text-xl font-bold text-sport-black">Julie Dubois</h1>
                <p className="text-sport-gray">28 ans • Femme</p>
                <p className="text-sport-gray">📞 +1 (514) 555-0123</p>
                <p className="text-sport-gray">✉️ julie.dubois@email.com</p>
                
                <div className="flex items-center gap-2 mt-2">
                  <Star size={16} className="text-yellow-500 fill-current" />
                  <span className="font-medium">4.9</span>
                  <span className="text-sport-gray">(25 avis)</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-primary">15</p>
                <p className="text-sm text-sport-gray">Courses jointes</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-primary">3</p>
                <p className="text-sm text-sport-gray">Courses organisées</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-primary">120</p>
                <p className="text-sm text-sport-gray">km parcourus</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Achievements */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Award size={20} />
              Badges
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 p-3 bg-yellow-50 rounded-lg">
                <div className="w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center">
                  🏃‍♀️
                </div>
                <div>
                  <p className="font-medium text-sm">Coureuse régulière</p>
                  <p className="text-xs text-sport-gray">10 courses complétées</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                  👥
                </div>
                <div>
                  <p className="font-medium text-sm">Organisatrice</p>
                  <p className="text-xs text-sport-gray">3 sessions créées</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Running history */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg">Courses récentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
                <div className="flex-1">
                  <div className="flex justify-between items-start mb-1">
                    <h4 className="font-medium">Course urbaine - Centre-ville</h4>
                    <Badge variant="secondary" className="text-xs">Terminée</Badge>
                  </div>
                  <p className="text-sm text-sport-gray flex items-center gap-1 mb-1">
                    <Calendar size={12} />
                    12 mars 2024
                  </p>
                  <p className="text-sm text-sport-gray flex items-center gap-1">
                    <Users size={12} />
                    6 participants • 8km
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                <div className="flex-1">
                  <div className="flex justify-between items-start mb-1">
                    <h4 className="font-medium">Course matinale - Parc Central</h4>
                    <Badge variant="outline" className="text-xs">Confirmée</Badge>
                  </div>
                  <p className="text-sm text-sport-gray flex items-center gap-1 mb-1">
                    <Calendar size={12} />
                    Demain, 15 mars
                  </p>
                  <p className="text-sm text-sport-gray flex items-center gap-1">
                    <Users size={12} />
                    5/8 participants • 8km
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="w-2 h-2 bg-gray-400 rounded-full mt-2"></div>
                <div className="flex-1">
                  <div className="flex justify-between items-start mb-1">
                    <h4 className="font-medium">Trail en nature</h4>
                    <Badge variant="outline" className="text-xs">Organisée</Badge>
                  </div>
                  <p className="text-sm text-sport-gray flex items-center gap-1 mb-1">
                    <Calendar size={12} />
                    20 mars 2024
                  </p>
                  <p className="text-sm text-sport-gray flex items-center gap-1">
                    <Users size={12} />
                    2/6 participants • 12km
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Button variant="sport" size="lg" className="w-full">
            Modifier le profil
          </Button>
          <Button variant="sportSecondary" size="lg" className="w-full">
            Paramètres de notification
          </Button>
          <Button variant="ghost" size="lg" className="w-full text-destructive">
            Se déconnecter
          </Button>
        </div>
      </div>

      <Navigation />
    </div>
  );
};

export default Profile;