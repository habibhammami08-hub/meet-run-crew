import { useEffect, useState } from "react";
import { Crown } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { isFreePromoActive } from "@/config/promo";

const PromoWelcome = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user || !isFreePromoActive()) return;
    const key = `meetrun_promo_seen_${user.id}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
    setOpen(true);
  }, [user?.id]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm text-center animate-scale-in">
        <div className="mx-auto mb-2 flex h-20 w-20 items-center justify-center rounded-full bg-promo/15 motion-safe:animate-[pulse_2s_ease-in-out_infinite]">
          <Crown className="h-10 w-10 text-promo motion-safe:animate-fade-in" />
        </div>
        <DialogTitle className="text-2xl motion-safe:animate-fade-in">Bienvenue sur MeetRun 🎉</DialogTitle>
        <DialogDescription className="text-base animate-fade-in">
          Votre accès <strong>MeetRun Unlimited</strong> est offert automatiquement dès l’inscription jusqu’au 31 décembre 2026 (au lieu de 9,99 €/mois). Aucun paiement nécessaire.
        </DialogDescription>
        <Button className="mt-4 w-full" onClick={() => setOpen(false)}>C'est parti !</Button>
      </DialogContent>
    </Dialog>
  );
};

export default PromoWelcome;
