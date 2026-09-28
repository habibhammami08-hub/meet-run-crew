// src/pages/Subscription.tsx
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Crown, Check, X, ExternalLink, Users, User, MapPin } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getSupabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import logoImage from "@/assets/meetrun-logo-final.png";
import PromoOffer from "@/components/PromoOffer";
import { isFreePromoActive } from "@/config/promo";

const Subscription = () => {
  const { user, hasActiveSubscription, subscriptionStatus, subscriptionEnd, refreshSubscription } = useAuth();
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [isSubLoading, setIsSubLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const supabase = getSupabase();
  const [searchParams] = useSearchParams();

  // ————— Gestion du retour Stripe : /subscription?checkout=success|cancel
  useEffect(() => {
    if (isFreePromoActive()) return;
    const checkout = searchParams.get("checkout");
    if (!checkout) return;

    (async () => {
      if (checkout === "success") {
        try {
          await refreshSubscription();
          toast({
            title: "Abonnement actif 🎉",
            description: "Bienvenue sur MeetRun Unlimited !",
          });
        } finally {
          navigate("/subscription", { replace: true });
        }
      } else if (checkout === "cancel") {
        toast({
          title: "Abonnement annulé",
          description: "Aucun prélèvement n'a été effectué.",
          variant: "destructive",
        });
        navigate("/subscription", { replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const token = (await supabase.auth.getSession()).data.session?.access_token;

      const { data, error } = await supabase.functions.invoke("create-customer-portal-session", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;

      const portalUrl =
        (data as any)?.portal_url ||
        (data as any)?.url ||
        (data as any)?.checkout_url;

      if (!portalUrl) {
        throw new Error("Aucune URL de portail reçue depuis le serveur.");
      }

      window.location.assign(portalUrl);
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message ?? "Impossible d’ouvrir le portail client.",
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
      const token = (await supabase.auth.getSession()).data.session?.access_token;

      const success_url = `${window.location.origin}/subscription?checkout=success&sid={CHECKOUT_SESSION_ID}`;
      const cancel_url = `${window.location.origin}/subscription?checkout=cancel`;

      const { data, error } = await supabase.functions.invoke("create-subscription-session", {
        body: { success_url, cancel_url },
        headers: { Authorization: `Bearer ${token}` },
      });

      if (error) throw error;
      const url = (data as any)?.url || (data as any)?.checkout_url || (data as any)?.checkoutUrl;
      if (!url) throw new Error("L'Edge Function n'a pas renvoyé d'URL d'abonnement.");

      window.location.assign(url);
    } catch (e: any) {
      toast({
        title: "Abonnement indisponible",
        description: e?.message || "Impossible d'ouvrir la page d'abonnement.",
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

  if (isFreePromoActive()) {
    return (
      <div className="min-h-screen bg-background">
        <header className="fixed top-0 left-0 right-0 z-50 px-4 py-3" style={{ background: 'linear-gradient(to right, #101111, #2c2d2c)' }}>
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <Link to="/"><img src={logoImage} alt="MeetRun Logo" className="h-10 w-auto cursor-pointer" /></Link>
            <Button variant="ghost" onClick={() => navigate(user ? "/profile" : "/auth?returnTo=/subscription")} className="text-white font-semibold hover:bg-white/10">
              {user ? "Profil" : "Se connecter"}
            </Button>
          </div>
        </header>
        <main className="main-content pt-24 pb-24">
          <PromoOffer signedIn={!!user} />
          <div className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
            <h3 className="text-2xl font-bold text-foreground">Tout MeetRun, sans limite</h3>
            <div className="mt-6 grid gap-6 sm:grid-cols-3">
              <div className="border-t-2 border-promo pt-4"><MapPin size={24} className="text-promo" /><h4 className="mt-3 font-bold">Rendez-vous précis</h4><p className="mt-1 text-sm text-muted-foreground">Accédez aux lieux de départ exacts de toutes les sessions.</p></div>
              <div className="border-t-2 border-primary pt-4"><Users size={24} className="text-primary" /><h4 className="mt-3 font-bold">Courez autant que vous voulez</h4><p className="mt-1 text-sm text-muted-foreground">Rejoignez les sessions sans payer à chaque sortie.</p></div>
              <div className="border-t-2 border-promo pt-4"><Crown size={24} className="text-promo" /><h4 className="mt-3 font-bold">Activé dès l’inscription</h4><p className="mt-1 text-sm text-muted-foreground">Votre accès est offert automatiquement jusqu’au 31 décembre 2026.</p></div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ————— Vue publique si non connecté
  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="fixed top-0 left-0 right-0 z-50 px-4 py-3" style={{ background: 'linear-gradient(to right, #101111, #2c2d2c)' }}>
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <Link to="/">
              <img
                src={logoImage}
                alt="MeetRun Logo"
                className="h-10 w-auto cursor-pointer"
              />
            </Link>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => navigate("/auth?returnTo=/subscription")} className="text-white font-semibold hover:bg-white/10">
                Se connecter
              </Button>
              <Button variant="sport" onClick={() => navigate("/auth?mode=signup&returnTo=/subscription")}>
                S'inscrire
              </Button>
            </div>
          </div>
        </header>

        <div className="p-4 space-y-6 main-content pt-24">
          <Card className="shadow-card border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-600 justify-center">
                <Crown size={24} />
                MeetRun Unlimited
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600 mb-2">9,99 €</div>
                <div className="text-sport-gray">par mois</div>
              </div>

              <div className="bg-sport-light p-4 rounded-lg">
                <h3 className="font-semibold mb-3 text-center">Accès illimité à tout MeetRun :</h3>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-deep" />
                    Rejoindre toutes les sessions sans payer à la course
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-deep" />
                    Voir les lieux exacts (plus de zones approximatives)
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-deep" />
                    Créer des sessions illimitées
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-deep" />
                    Support prioritaire
                  </li>
                </ul>
              </div>

              <div className="space-y-3 text-center max-w-sm mx-auto">
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

                <p className="text-xs text-sport-gray">Résiliable à tout moment • Facturation mensuelle</p>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-center">Pourquoi MeetRun Unlimited ?</CardTitle>
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

  // ————— Vue utilisateur connecté
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 px-4 py-3" style={{ background: 'linear-gradient(to right, #101111, #2c2d2c)' }}>
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <Link to="/">
            <img
              src={logoImage}
              alt="MeetRun Logo"
              className="h-10 w-auto cursor-pointer"
            />
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => navigate("/profile")} className="flex items-center gap-2 text-white hover:text-white hover:bg-white/10">
              <User size={16} />
              Profil
            </Button>
          </div>
        </div>
      </header>

      <div className="p-4 space-y-6 main-content pt-24">
        {hasActiveSubscription ? (
          <Card className="shadow-card border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-600 justify-center">
                <Crown size={20} />
                Abonnement MeetRun Unlimited
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-center gap-2">
                <Badge variant="default" className="bg-deep/10 text-deep">
                  <Check size={14} className="mr-1" />
                  Actif
                </Badge>
              </div>

              {subscriptionEnd && (
                <p className="text-sm text-sport-gray text-center">
                  Renouvellement automatique le {formatDate(subscriptionEnd)}
                </p>
              )}

              <div className="bg-sport-light p-4 rounded-lg max-w-lg mx-auto">
                <h3 className="font-semibold mb-2 text-center">Avantages inclus :</h3>
                <ul className="space-y-1 text-sm">
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-deep" />
                    Accès illimité à toutes les sessions
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-deep" />
                    Lieux exacts révélés
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-deep" />
                    Aucun paiement à la course
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-deep" />
                    Support prioritaire
                  </li>
                </ul>
              </div>

              <div className="flex items-center justify-center gap-2">
                <Button
                  onClick={handleManageSubscription}
                  disabled={isPortalLoading}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <ExternalLink size={16} />
                  {isPortalLoading ? "Redirection..." : "Gérer mon abonnement"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 justify-center">
                <Crown size={20} className="text-sport-gray" />
                Abonnement MeetRun Unlimited
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-center gap-2">
                <Badge variant="outline" className="bg-gray-100 text-gray-600">
                  <X size={14} className="mr-1" />
                  Non abonné
                </Badge>
              </div>

              <p className="text-sport-gray text-center max-w-lg mx-auto">
                Vous n'êtes pas encore abonné. Souscrivez dès maintenant pour profiter de l'accès illimité !
              </p>

              <div className="bg-sport-light p-4 rounded-lg max-w-lg mx-auto">
                <h3 className="font-semibold mb-2 text-center">Avec l'abonnement, profitez de :</h3>
                <ul className="space-y-1 text-sm">
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-deep" />
                    Accès illimité à toutes les sessions
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-deep" />
                    Lieux exacts révélés (plus de zones approximatives)
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-deep" />
                    Aucun paiement à la course
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-deep" />
                    Support prioritaire
                  </li>
                </ul>
              </div>

              <div className="space-y-3 max-w-sm mx-auto text-center">
                <div className="flex items-center justify-center gap-2">
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

                <p className="text-xs text-sport-gray">Résiliable à tout moment</p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-center">Pourquoi MeetRun Unlimited ?</CardTitle>
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
};

export default Subscription;
