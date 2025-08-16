import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { Crown, Check, X, ExternalLink, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// Déclaration pour Stripe Buy Button
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'stripe-buy-button': {
        'buy-button-id': string;
        'publishable-key': string;
      };
    }
  }
}

const Subscription = () => {
  const { user, hasActiveSubscription, subscriptionStatus, subscriptionEnd, refreshSubscription } = useAuth();
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [stripeBuyButtonLoaded, setStripeBuyButtonLoaded] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Charger le script Stripe Buy Button
  useEffect(() => {
    const existingScript = document.querySelector('script[src="https://js.stripe.com/v3/buy-button.js"]');
    
    if (!existingScript) {
      const script = document.createElement('script');
      script.src = 'https://js.stripe.com/v3/buy-button.js';
      script.async = true;
      script.onload = () => {
        console.log("[stripe] Buy Button script chargé");
        setStripeBuyButtonLoaded(true);
      };
      script.onerror = () => {
        console.error("[stripe] Erreur chargement Buy Button script");
        toast({
          title: "Erreur de chargement",
          description: "Impossible de charger le système de paiement",
          variant: "destructive",
        });
      };
      document.body.appendChild(script);
    } else {
      setStripeBuyButtonLoaded(true);
    }

    // Écouter les événements Stripe
    const handleStripeMessage = (event: MessageEvent) => {
      if (event.origin !== 'https://js.stripe.com') return;
      
      if (event.data?.type === 'stripe_checkout_session_complete') {
        console.log("[stripe] Checkout complété:", event.data);
        toast({
          title: "Paiement réussi !",
          description: "Votre abonnement est maintenant actif.",
        });
        // Actualiser le statut d'abonnement
        setTimeout(() => {
          refreshSubscription();
        }, 2000);
      } else if (event.data?.type === 'stripe_checkout_session_cancel') {
        console.log("[stripe] Checkout annulé:", event.data);
        toast({
          title: "Paiement annulé",
          description: "Vous pouvez réessayer quand vous voulez.",
        });
      }
    };

    window.addEventListener('message', handleStripeMessage);

    return () => {
      window.removeEventListener('message', handleStripeMessage);
    };
  }, [toast, refreshSubscription]);

  const handleManageSubscription = async () => {
    if (!user) {
      toast({
        title: "Connexion requise",
        description: "Connectez-vous pour gérer votre abonnement.",
        variant: "destructive",
      });
      return;
    }

    setIsPortalLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('create-customer-portal-session', {
        headers: {
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
      });

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

  // CORRECTION: Page accessible même sans être connecté
  const renderUnauthenticatedView = () => (
    <div className="min-h-screen bg-background">
      <div className="p-4 space-y-6 main-content">
        {/* Hero pour non connectés */}
        <Card className="shadow-card border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary text-center">
              <Crown size={24} />
              MeetRun Unlimited
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-primary mb-2">9,99 €</div>
              <div className="text-sport-gray">par mois</div>
            </div>

            <div className="bg-sport-light p-4 rounded-lg">
              <h3 className="font-semibold mb-3 text-center">Accès illimité à tout MeetRun :</h3>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <Check size={14} className="text-green-600" />
                  Rejoindre toutes les sessions sans payer à la course
                </li>
                <li className="flex items-center gap-2">
                  <Check size={14} className="text-green-600" />
                  Voir les lieux exacts (plus de zones approximatives)
                </li>
                <li className="flex items-center gap-2">
                  <Check size={14} className="text-green-600" />
                  Créer des sessions illimitées
                </li>
                <li className="flex items-center gap-2">
                  <Check size={14} className="text-green-600" />
                  Support prioritaire
                </li>
              </ul>
            </div>

            {/* Call-to-action pour non connectés */}
            <div className="space-y-3 text-center">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-800 font-medium">
                  🔒 Connexion requise pour s'abonner
                </p>
                <p className="text-xs text-yellow-700 mt-1">
                  Créez un compte pour sécuriser votre abonnement
                </p>
              </div>
              
              <Button 
                onClick={() => navigate('/auth')}
                variant="default"
                size="lg"
                className="w-full"
              >
                <Users size={16} className="mr-2" />
                Se connecter / Créer un compte
              </Button>
              
              <div className="text-center">
                <p className="text-xs text-sport-gray">
                  Résiliable à tout moment • Facturation mensuelle
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Avantages détaillés */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Pourquoi MeetRun Unlimited ?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-2xl mb-2">🎯</div>
                <h4 className="font-semibold">Lieux exacts</h4>
                <p className="text-sm text-sport-gray">Fini les zones approximatives ! Voyez exactement où vous rendre.</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-2xl mb-2">💸</div>
                <h4 className="font-semibold">Économique</h4>
                <p className="text-sm text-sport-gray">Une session par mois et c'est rentabilisé !</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-2xl mb-2">🏃‍♀️</div>
                <h4 className="font-semibold">Illimité</h4>
                <p className="text-sm text-sport-gray">Participez à autant de sessions que vous voulez.</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-2xl mb-2">👥</div>
                <h4 className="font-semibold">Communauté</h4>
                <p className="text-sm text-sport-gray">Rencontrez d'autres coureurs passionnés.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  // Si pas connecté, afficher la vue publique
  if (!user) {
    return renderUnauthenticatedView();
  }

  // Vue pour utilisateurs connectés
  return (
    <div className="min-h-screen bg-background">
      <div className="p-4 space-y-6 main-content">
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

              <div className="text-center space-y-4">
                {/* CORRECTION: Stripe Buy Button pour utilisateurs connectés */}
                {stripeBuyButtonLoaded ? (
                  <div className="stripe-buy-button-container w-full">
                    <stripe-buy-button
                      buy-button-id="buy_btn_1RvtvYKP4tLYoLjrySSiu2m2"
                      publishable-key="pk_live_51L4ftdKP4tLYoLjrVwqm62fAaf0nSId8MHrgaCBvgIrTYybjRMpNTYluRbN57delFbimulCyODAD8G0QaxEaLz5T00Uey2dOSc"
                    />
                  </div>
                ) : (
                  <div className="w-full p-4 bg-gray-100 rounded-lg text-center">
                    <div className="animate-pulse">Chargement du paiement...</div>
                  </div>
                )}
                
                <p className="text-xs text-sport-gray">
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
            <div>
              <h4 className="font-semibold">Comment fonctionne le paiement ?</h4>
              <p className="text-sm text-sport-gray">
                Le paiement est sécurisé par Stripe. Votre carte est débitée mensuellement jusqu'à résiliation.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Subscription;