// Interrupteur unique de la promo "MeetRun Unlimited gratuit".
// Passer à false pour réactiver immédiatement les paiements et abonnements Stripe.
export const FREE_PROMO_ENABLED = true;

// Fin de la promo (inclus) — après cette date, la promo se désactive automatiquement.
export const FREE_PROMO_END = new Date("2026-12-31T23:59:59+01:00");

export const isFreePromoActive = () => FREE_PROMO_ENABLED && Date.now() <= FREE_PROMO_END.getTime();
