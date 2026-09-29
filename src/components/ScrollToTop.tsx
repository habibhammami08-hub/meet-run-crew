import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Remet la fenêtre en haut de page à chaque changement de route,
 * y compris navigation par liens, retour arrière et paramètres d'URL.
 */
const ScrollToTop = () => {
  const { pathname, search } = useLocation();

  useEffect(() => {
    // Entrée instantanée : la nouvelle page démarre toujours en haut.
    if (typeof window !== "undefined" && "scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
    window.scrollTo(0, 0);
  }, [pathname, search]);

  return null;
};

export default ScrollToTop;
