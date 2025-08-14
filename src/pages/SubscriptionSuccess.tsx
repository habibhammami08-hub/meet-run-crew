import { useEffect, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Header from "@/components/Header";
import { CheckCircle, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";

const SubscriptionSuccess = () => {
  const { user, refreshSubscription } = useAuth();
  const navigate = useNavigate();
  const [isRefreshing, setIsRefreshing] = useState(true);

  useEffect(() => {
    const refreshUserProfile = async () => {
      if (user) {
        try {
          // Refetch user profile from Supabase
          await refreshSubscription();
        } catch (error) {
          console.error('Error refreshing subscription status:', error);
        } finally {
          setIsRefreshing(false);
        }
      } else {
        setIsRefreshing(false);
      }
    };

    refreshUserProfile();
  }, [user, refreshSubscription]);

  return (
    <div className="min-h-screen bg-background">
      <Header title="Paiement validé" />
      
      <div className="p-4 space-y-6 pb-20 pt-20">
        <Card className="shadow-card border-green-200">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <CheckCircle size={64} className="text-green-600" />
            </div>
            <CardTitle className="text-2xl text-green-800">
              Paiement validé !
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 text-center">
            <p className="text-lg">
              Félicitations ! Votre abonnement MeetRun Unlimited est maintenant actif.
            </p>
            
            {isRefreshing ? (
              <p className="text-sport-gray">
                Mise à jour de votre profil en cours...
              </p>
            ) : (
              <div className="bg-green-50 p-4 rounded-lg">
                <h3 className="font-semibold text-green-800 mb-2">
                  Vous avez maintenant accès à :
                </h3>
                <ul className="text-sm text-green-700 space-y-1">
                  <li>✓ Accès illimité à toutes les sessions</li>
                  <li>✓ Lieux exacts révélés</li>
                  <li>✓ Aucun paiement à la course</li>
                  <li>✓ Support prioritaire</li>
                </ul>
              </div>
            )}

            <div className="space-y-3">
              <Button 
                onClick={() => navigate('/subscription')}
                className="w-full"
                variant="default"
              >
                Voir mon abonnement
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

export default SubscriptionSuccess;