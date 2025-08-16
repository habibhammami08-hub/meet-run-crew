import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { CheckCircle, Crown, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const SubscriptionSuccess = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refreshSubscription } = useAuth();
  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    // Refresh subscription status when landing on success page
    refreshSubscription();
  }, [refreshSubscription]);

  return (
    <div className="min-h-screen bg-background">
      <div className="p-4 flex items-center justify-center min-h-screen">
        <Card className="shadow-card max-w-md w-full">
          <CardContent className="p-8 text-center space-y-6">
            <div className="flex justify-center">
              <div className="relative">
                <CheckCircle size={64} className="text-green-500" />
                <Crown size={24} className="absolute -top-2 -right-2 text-yellow-500" />
              </div>
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-sport-black">
                Abonnement activé ! 🎉
              </h1>
              <p className="text-sport-gray">
                Félicitations ! Vous avez maintenant accès illimité à toutes les sessions MeetRun.
              </p>
            </div>

            <div className="bg-sport-light p-4 rounded-lg">
              <h3 className="font-semibold mb-2">Vous pouvez maintenant :</h3>
              <ul className="text-sm space-y-1 text-left">
                <li className="flex items-center gap-2">
                  <CheckCircle size={14} className="text-green-600" />
                  Voir les lieux exacts de toutes les sessions
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle size={14} className="text-green-600" />
                  Rejoindre n'importe quelle session sans payer
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle size={14} className="text-green-600" />
                  Profiter de l'accès illimité
                </li>
              </ul>
            </div>

            {sessionId && (
              <div className="text-xs text-sport-gray bg-gray-50 p-2 rounded">
                Session ID: {sessionId}
              </div>
            )}

            <div className="space-y-3">
              <Button 
                onClick={() => navigate('/map')}
                size="lg"
                className="w-full"
                variant="sport"
              >
                <ArrowRight size={16} className="mr-2" />
                Découvrir les sessions
              </Button>
              
              <Button 
                onClick={() => navigate('/subscription')}
                variant="outline"
                size="lg"
                className="w-full"
              >
                Gérer mon abonnement
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SubscriptionSuccess;