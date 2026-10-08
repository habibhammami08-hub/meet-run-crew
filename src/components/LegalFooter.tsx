import { Link } from "react-router-dom";
import { isFreePromoActive } from "@/config/promo";

/**
 * Pied de page discret : mention de la marque et accès aux informations légales.
 * Utilisé sur les pages principales pour que ces mentions restent toujours joignables.
 */
const LegalFooter = () => (
  <footer className="mx-auto w-full max-w-md px-4 pb-2 pt-8 text-center">
    <p className="text-[11px] leading-relaxed text-muted-foreground">
      MeetRun — une marque de 2H consulting SAS
    </p>
    <p className="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
      <Link to="/legal" className="underline underline-offset-2 hover:text-foreground">
        Mentions légales
      </Link>
      <span aria-hidden="true">·</span>
      <a href="mailto:contact@meetrun.fr" className="underline underline-offset-2 hover:text-foreground">
        contact@meetrun.fr
      </a>
      {isFreePromoActive() && (
        <>
          <span aria-hidden="true">·</span>
          <Link to="/subscription" className="underline underline-offset-2 hover:text-foreground">
            Abonnement
          </Link>
        </>
      )}
    </p>
  </footer>
);

export default LegalFooter;
