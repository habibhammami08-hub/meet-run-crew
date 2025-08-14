import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import { XCircle, RotateCcw, ArrowLeft } from "lucide-react";

const SubscriptionCancel = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <Header title="Abonnement annulé" />
      
      <div className="p-4 pt-20 flex items-center justify-center min-h-[calc(100vh-80px)]">
        <Card className="shadow-card max-w-md w-full">
          <CardContent className="p-8 text-center space-y-6">
            <div className="flex justify-center">
              <XCircle size={64} className="text-orange-500" />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-sport-black">
                Abonnement annulé
              </h1>
              <p className="text-sport-gray">
                Votre abonnement n'a pas été finalisé. Vous pouvez réessayer à tout moment.
              </p>
            </div>

            <div className="bg-sport-light p-4 rounded-lg">
              <h3 className="font-semibold mb-2">Sans abonnement :</h3>
              <ul className="text-sm space-y-1 text-left">
                <li className="flex items-center gap-2">
                  <XCircle size={14} className="text-orange-500" />
                  Zones approximatives uniquement
                </li>
                <li className="flex items-center gap-2">
                  <XCircle size={14} className="text-orange-500" />
                  Accès limité aux sessions
                </li>
                <li className="flex items-center gap-2">
                  <XCircle size={14} className="text-orange-500" />
                  Pas de lieu exact révélé
                </li>
              </ul>
            </div>

            <div className="space-y-3">
              <Button 
                onClick={() => navigate('/subscription')}
                size="lg"
                className="w-full"
                variant="sport"
              >
                <RotateCcw size={16} className="mr-2" />
                Réessayer l'abonnement
              </Button>
              
              <Button 
                onClick={() => navigate('/map')}
                variant="outline"
                size="lg"
                className="w-full"
              >
                <ArrowLeft size={16} className="mr-2" />
                Retour à la carte
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SubscriptionCancel;