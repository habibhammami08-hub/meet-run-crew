// src/pages/subscription/SubscriptionSuccess.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Crown, ArrowRight, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { isFreePromoActive } from "@/config/promo";

type Phase = "checking" | "active" | "timeout";

const POLL_INTERVAL_MS = 2000;  // toutes les 2s
const MAX_TRIES = 15;           // ~30s max

const SubscriptionSuccess = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { hasActiveSubscription, refreshSubscription } = useAuth();

  const sessionId = searchParams.get("session_id");
  const returnTo = searchParams.get("returnTo"); // ex: /session/abcd-1234

  const [phase, setPhase] = useState<Phase>("checking");
  const triesRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  // Quand le composant arrive ici après le checkout success,
  // on essaie de s'assurer que le webhook a bien mis à jour le profil.
  useEffect(() => {
    if (isFreePromoActive()) return;
    let cancelled = false;

    const poll = async () => {
      // 1. Demande un refresh du profil (hook useAuth)
      await refreshSubscription();

      if (cancelled) return;

      // 2. Si déjà actif → stop & succès
      if (hasActiveSubscription) {
        setPhase("active");
        return;
      }

      // 3. Sinon, retente jusqu’à MAX_TRIES
      triesRef.current += 1;
      if (triesRef.current >= MAX_TRIES) {
        setPhase("timeout");
        return;
      }

      timerRef.current = window.setTimeout(poll, POLL_INTERVAL_MS);
    };

    // Démarre le polling
    poll();

    // Cleanup
    return () => {
      cancelled = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSubscription]); // on dépend uniquement de la fonction

  // Si le hook remonte l'activation plus tard (avant la fin d'une itération)
  useEffect(() => {
    if (isFreePromoActive()) return;
    if (hasActiveSubscription) {
      setPhase("active");
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [hasActiveSubscription]);

  const primaryCta = useMemo(() => {
    // S'il y a un retour ciblé, on le priorise
    if (returnTo) {
      return {
        label: "Revenir à votre session",
        onClick: () => navigate(returnTo),
      };
    }
    return {
      label: "Découvrir les sessions",
      onClick: () => navigate("/map"),
    };
  }, [navigate, returnTo]);

  const retry = async () => {
    triesRef.current = 0;
    setPhase("checking");
    await refreshSubscription();
  };

  if (isFreePromoActive()) return (
    <main className="min-h-screen bg-background flex items-center justify-center p-6 text-center">
      <div className="max-w-lg space-y-5">
        <Crown className="mx-auto h-12 w-12 text-promo" />
        <h1 className="text-3xl font-bold">Votre accès Unlimited est offert</h1>
        <p className="text-muted-foreground">Activé automatiquement dès l’inscription, gratuitement jusqu’au 31 décembre 2026 (au lieu de 9,99 €/mois).</p>
        <Button variant="sport" onClick={primaryCta.onClick}>{primaryCta.label}</Button>
      </div>
    </main>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="p-4 flex items-center justify-center min-h-screen">
        <Card className="shadow-card max-w-md w-full">
          <CardContent className="p-8 text-center space-y-6">
            <div className="flex justify-center">
              <div className="relative">
                <CheckCircle size={64} className={phase === "active" ? "text-green-500" : "text-gray-300"} />
                <Crown size={24} className={`absolute -top-2 -right-2 ${phase === "active" ? "text-yellow-500" : "text-gray-300"}`} />
              </div>
            </div>

            <div className="space-y-2" aria-live="polite">
              {phase === "active" ? (
                <>
                  <h1 className="text-2xl font-bold text-sport-black">Abonnement activé ! 🎉</h1>
                  <p className="text-sport-gray">
                    Vous avez maintenant un accès illimité à toutes les sessions MeetRun.
                  </p>
                </>
              ) : phase === "checking" ? (
                <>
                  <h1 className="text-2xl font-bold text-sport-black">Activation en cours…</h1>
                  <p className="text-sport-gray">
                    Nous finalisons votre abonnement (quelques secondes).
                  </p>
                  <div className="flex items-center justify-center gap-2 text-sport-gray">
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span>Vérification…</span>
                  </div>
                </>
              ) : (
                <>
                  <h1 className="text-2xl font-bold text-sport-black">Presque fini…</h1>
                  <p className="text-sport-gray">
                    Nous n’avons pas pu confirmer l’activation automatiquement. Vous pouvez réessayer ci-dessous.
                  </p>
                </>
              )}
            </div>

            {phase !== "checking" && (
              <div className="bg-sport-light p-4 rounded-lg text-left">
                <h3 className="font-semibold mb-2">Vous pouvez maintenant :</h3>
                <ul className="text-sm space-y-1">
                  <li className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-green-600" />
                    Voir les lieux exacts de toutes les sessions
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-green-600" />
                    Rejoindre n’importe quelle session sans payer
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-green-600" />
                    Profiter de l’accès illimité
                  </li>
                </ul>
              </div>
            )}

            {sessionId && (
              <div className="text-[11px] text-sport-gray bg-gray-50 p-2 rounded break-all">
                Checkout session: {sessionId}
              </div>
            )}

            <div className="space-y-3">
              {phase === "active" ? (
                <>
                  <Button onClick={primaryCta.onClick} size="lg" className="w-full" variant="sport">
                    <ArrowRight size={16} className="mr-2" />
                    {primaryCta.label}
                  </Button>
                  <Button onClick={() => navigate("/subscription")} variant="outline" size="lg" className="w-full">
                    Gérer mon abonnement
                  </Button>
                </>
              ) : phase === "checking" ? (
                <Button onClick={() => navigate("/map")} variant="ghost" className="w-full">
                  Continuer vers les sessions
                </Button>
              ) : (
                <>
                  <Button onClick={retry} className="w-full">
                    <RefreshCw size={16} className="mr-2" />
                    Réessayer la vérification
                  </Button>
                  <Button onClick={() => navigate("/subscription")} variant="outline" className="w-full">
                    Voir l’état de mon abonnement
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SubscriptionSuccess;
