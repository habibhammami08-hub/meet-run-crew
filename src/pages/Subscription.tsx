// src/pages/Subscription.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { Crown, Check, X, ExternalLink, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getSupabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const Subscription = () => {
  const { user, hasActiveSubscription, subscriptionStatus, subscriptionEnd, refreshSubscription } = useAuth();
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [isSubLoading, setIsSubLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const supabase = getSupabase();

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
      const { data, error } = await supabase.functions.invoke("create-customer-portal-session", {
        headers: {
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
      });

      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
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

  const startSubscriptionCheckout = async () => {
    if (!user) {
      navigate(`/auth?returnTo=${encodeURIComponent("/subscription")}`);
      return;
    }

    setIsSubLoading(true);
    try {
      // L’Edge Function gère success/cancel URL automatiquement (Option B)
      const { data, error } = await supabase.functions.invoke("create-subscription-session");
      if (error) throw error;

      const url = (data as any)?.url || (data as any)?.checkout_url || (data as any)?.checkoutUrl;
      if (!url) throw new Error("L’Edge Function n’a pas renvoyé d’URL d’abonnement.");
      window.location.assign(url);
    } catch (e: any) {
      toast({
        title: "Abonnement indisponible",
        description: e?.message || "Impossible d’ouvrir la page d’abonnement.",
        variant: "destructive",
      });
    } finally {
      setIsSubLoading(false);
    }
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString("fr-FR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  // Vue publique si non connecté
  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <div className="p-4 space-y-6 main-content">
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

              <div className="space-y-3 text-center">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm text-yellow-800 font-medium">🔒 Connexion requise pour s'abonner</p>
                  <p className="text-xs text-yellow-700 mt-1">Créez un compte pour sécuriser votre abonnement</p>
                </div>

                <Button
                  onClick={() => navigate(`/auth?returnTo=${encodeURIComponent("/subscription")}`)}
                  variant="default"
                  size="lg"
                  className="w-full"
                >
                  <Users size={16} className="mr-2" />
                  Se connecter / Créer un compte
                </Button>

                <div className="text-center">
                  <p className="text-xs text-sport-gray">Résiliable à tout moment • Facturation mensuelle</p>
                </div>
              </div>
            </CardContent>
          </Card>

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
                  <p className="text-sm text-sport-gray">3 sessions par mois et c'est rentabilisé !</p>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-2xl mb-2">🏃‍♀️</div>
                  <h4 className="font-semibold">Illimité</h4>
                  <p className="text-sm text-sport-gray">Participez à autant de sessions que vous voulez.</p>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-2xl mb-2">👥</div>
                  <h4 className="font-semibold">Rencontre</h4>
                  <p className="text-sm text-sport-gray">Rencontrez d'autres personnes près de chez vous.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Vue pour utilisateurs connectés
  return (
    <div className="min-h-screen bg-background">
      <div className="p-4 space-y-6 main-content">
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
                <span className="text-sm text-sport-gray">Statut: {subscriptionStatus}</span>
              </div>

              {subscriptionEnd && (
                <p className="text-sm text-sport-gray">Renouvellement automatique le {formatDate(subscriptionEnd)}</p>
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
                <Button onClick={refreshSubscription} variant="ghost" size="sm">
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

              {/* CTA identique à SessionDetails */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold text-blue-600">9,99€/mois</span>
                  <Badge variant="secondary">Économique</Badge>
                </div>

                <Button
                  onClick={startSubscriptionCheckout}
                  disabled={isSubLoading}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  {isSubLoading ? "Ouverture..." : (
                    <>
                      <Crown className="w-4 h-4 mr-2" />
                      S'abonner
                    </>
                  )}
                </Button>

                <p className="text-xs text-sport-gray text-center">Résiliable à tout moment</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pourquoi MeetRun Unlimited */}
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
                <p className="text-sm text-sport-gray">3 sessions par mois et c'est rentabilisé !</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-2xl mb-2">🏃‍♀️</div>
                <h4 className="font-semibold">Illimité</h4>
                <p className="text-sm text-sport-gray">Participez à autant de sessions que vous voulez.</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-2xl mb-2">👥</div>
                <h4 className="font-semibold">Rencontre</h4>
                <p className="text-sm text-sport-gray">Rencontrez d'autres personnes près de chez vous.</p>
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
