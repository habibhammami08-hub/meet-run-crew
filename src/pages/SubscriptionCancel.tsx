import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Header from "@/components/Header";
import { XCircle, ArrowLeft, RotateCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";

const SubscriptionCancel = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <Header title="Paiement annulé" />
      
      <div className="p-4 space-y-6 pb-20 pt-20">
        <Card className="shadow-card border-orange-200">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <XCircle size={64} className="text-orange-600" />
            </div>
            <CardTitle className="text-2xl text-orange-800">
              Paiement annulé
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 text-center">
            <p className="text-lg text-sport-gray">
              Votre paiement a été annulé. Aucun montant n'a été débité.
            </p>
            
            <div className="bg-orange-50 p-4 rounded-lg">
              <p className="text-sm text-orange-700">
                Vous pouvez réessayer à tout moment pour profiter de l'accès illimité 
                à MeetRun avec les lieux exacts révélés.
              </p>
            </div>

            <div className="space-y-3">
              <Button 
                onClick={() => navigate('/subscription')}
                className="w-full flex items-center gap-2"
                variant="default"
              >
                <RotateCcw size={16} />
                Réessayer
              </Button>
              
              <Button 
                onClick={() => navigate('/')}
                variant="outline"
                className="w-full flex items-center gap-2"
              >
                <ArrowLeft size={16} />
                Retour à l'accueil
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SubscriptionCancel;