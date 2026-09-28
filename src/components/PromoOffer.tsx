import { Check, Crown, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

type PromoOfferProps = { compact?: boolean; signedIn?: boolean };
const benefits = ["Sessions illimitées", "Lieux de départ exacts", "Aucun paiement à la session"];

export default function PromoOffer({ compact = false, signedIn = false }: PromoOfferProps) {
  const navigate = useNavigate();
  return (
    <section className={`relative overflow-hidden border border-promo/30 bg-promo-surface text-promo-foreground ${compact ? "p-5 sm:p-7" : "px-6 py-10 sm:px-10 sm:py-14"}`}>
      <div className="relative z-10 max-w-3xl">
        <div className="inline-flex items-center gap-2 border border-promo/40 px-3 py-1 text-xs font-bold uppercase text-promo">
          <Sparkles size={14} /> Offre de lancement · Jusqu’au 31 décembre 2026
        </div>
        <div className="mt-5 flex items-center gap-2 text-promo"><Crown size={compact ? 22 : 30} /><span className="font-bold">MeetRun Unlimited</span></div>
        <h2 className={`${compact ? "text-2xl sm:text-3xl" : "text-3xl sm:text-5xl"} mt-3 font-extrabold leading-tight`}>
          Unlimited est à vous. <span className="text-promo">Offert.</span>
        </h2>
        <p className="mt-4 max-w-xl text-sm sm:text-base text-promo-foreground/80">
          {signedIn ? "Votre accès Unlimited est activé automatiquement depuis votre inscription." : "Inscrivez-vous et profitez automatiquement de MeetRun Unlimited, sans paiement ni abonnement à souscrire."} Jusqu’au 31 décembre 2026.
        </p>
        <div className="mt-5 flex flex-wrap items-end gap-3">
          <strong className="text-3xl sm:text-4xl text-promo">0 €</strong>
          <span className="mb-1 text-sm text-promo-foreground/65"><s>9,99 €/mois</s> · offert jusqu’au 31/12/2026</span>
        </div>
        <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {benefits.map((benefit) => <li key={benefit} className="flex items-center gap-2"><Check size={16} className="text-promo" />{benefit}</li>)}
        </ul>
        <Button className="mt-7 px-6 sm:px-7" variant="sport" size="lg" onClick={() => navigate(signedIn ? "/map" : "/auth?mode=signup&returnTo=/subscription")}>
          {signedIn ? "Explorer les sessions" : "Créer mon compte"}
        </Button>
      </div>
      <Crown aria-hidden className="pointer-events-none absolute -right-12 -bottom-16 h-64 w-64 rotate-[-20deg] text-promo/10 sm:h-80 sm:w-80" strokeWidth={1} />
    </section>
  );
}