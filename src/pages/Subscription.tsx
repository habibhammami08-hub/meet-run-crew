import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Header from "@/components/Header";
import { Crown, Check, X, ExternalLink } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const Subscription = () => {
  const { user, hasActiveSubscription, subscriptionStatus, subscriptionEnd, refreshSubscription } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const { toast } = useToast();

  const handleSubscribe = async () => {
    console.log("handleSubscribe called", { user: !!user });
    
    if (!user) {
      toast({
        title: "Connexion requise",
        description: "Vous devez être connecté pour vous abonner.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    console.log("Starting subscription creation...");

    try {
      console.log("Invoking create-subscription-session function...");
      const { data, error } = await supabase.functions.invoke('create-subscription-session');
      
      console.log("Function response:", { data, error });

      if (error) throw error;

      if (data.url) {
        console.log("Redirecting to Stripe checkout:", data.url);
        window.open(data.url, '_blank');
      } else {
        console.error("No URL returned from function:", data);
        throw new Error("Aucune URL de paiement reçue");
      }
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    if (!user) return;

    setIsPortalLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('create-customer-portal-session');

      if (error) throw error;

      if (data.url) {
        window.open(data.url, '_blank');
      }
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsPortalLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header title="Mon abonnement" />
      
      <div className="p-4 space-y-6 pb-20 pt-20">
        {/* Current Status */}
        {hasActiveSubscription ? (
          <Card className="shadow-card border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-primary">
                <Crown size={20} />
                Abonnement MeetRun Unlimited
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="default" className="bg-green-100 text-green-800">
                  <Check size={14} className="mr-1" />
                  Actif
                </Badge>
                <span className="text-sm text-sport-gray">
                  Statut: {subscriptionStatus}
                </span>
              </div>
              
              {subscriptionEnd && (
                <p className="text-sm text-sport-gray">
                  Renouvellement automatique le {formatDate(subscriptionEnd)}
                </p>
              )}

              <div className="bg-sport-light p-4 rounded-lg">
                <h3 className="font-semibold mb-2">Avantages inclus :</h3>
                <ul className="space-y-1 text-sm">
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-green-600" />
                    Accès illimité à toutes les sessions
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-green-600" />
                    Lieux exacts révélés
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-green-600" />
                    Aucun paiement à la course
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-green-600" />
                    Support prioritaire
                  </li>
                </ul>
              </div>

              <div className="flex gap-2">
                <Button 
                  onClick={handleManageSubscription} 
                  disabled={isPortalLoading}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <ExternalLink size={16} />
                  {isPortalLoading ? "Redirection..." : "Gérer mon abonnement"}
                </Button>
                <Button 
                  onClick={refreshSubscription}
                  variant="ghost"
                  size="sm"
                >
                  Actualiser
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Crown size={20} className="text-sport-gray" />
                Abonnement MeetRun Unlimited
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-gray-100 text-gray-600">
                  <X size={14} className="mr-1" />
                  Non abonné
                </Badge>
              </div>

              <p className="text-sport-gray">
                Vous n'êtes pas encore abonné. Souscrivez dès maintenant pour profiter de l'accès illimité !
              </p>

              <div className="bg-sport-light p-4 rounded-lg">
                <h3 className="font-semibold mb-2">Avec l'abonnement, profitez de :</h3>
                <ul className="space-y-1 text-sm">
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-green-600" />
                    Accès illimité à toutes les sessions
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-green-600" />
                    Lieux exacts révélés (plus de zones approximatives)
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-green-600" />
                    Aucun paiement à la course
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-green-600" />
                    Support prioritaire
                  </li>
                </ul>
              </div>

              <div className="text-center">
                <Button 
                  onClick={handleSubscribe} 
                  disabled={isLoading}
                  size="lg"
                  className="w-full"
                  variant="sport"
                >
                  {isLoading ? "Redirection vers le paiement..." : "S'abonner - 9,99 €/mois"}
                </Button>
                <p className="text-xs text-sport-gray mt-2">
                  Résiliable à tout moment
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pricing Info */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Tarification</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <div className="text-3xl font-bold text-primary">9,99 €</div>
              <div className="text-sport-gray">par mois</div>
              <div className="text-sm text-sport-gray mt-2">
                Facturation mensuelle • Résiliable à tout moment
              </div>
            </div>
          </CardContent>
        </Card>

        {/* FAQ */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Questions fréquentes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold">Puis-je annuler à tout moment ?</h4>
              <p className="text-sm text-sport-gray">
                Oui, vous pouvez annuler votre abonnement à tout moment depuis l'espace de gestion.
              </p>
            </div>
            <div>
              <h4 className="font-semibold">Que se passe-t-il si j'annule ?</h4>
              <p className="text-sm text-sport-gray">
                Vous gardez l'accès jusqu'à la fin de votre période de facturation, puis vous revenez aux zones approximatives.
              </p>
            </div>
            <div>
              <h4 className="font-semibold">Y a-t-il une période d'essai ?</h4>
              <p className="text-sm text-sport-gray">
                L'abonnement commence immédiatement après le paiement, sans période d'essai gratuite.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Subscription;