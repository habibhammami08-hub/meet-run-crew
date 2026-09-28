import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Demande la position de l'utilisateur à chaque changement de page,
 * tant que l'autorisation n'a pas été accordée.
 * - "granted" : on ne fait plus rien.
 * - "prompt" : on relance la demande (le navigateur affiche sa boîte).
 * - "denied" : le navigateur ne réaffichera pas la boîte ; on retente
 *   quand même silencieusement au cas où l'utilisateur l'aurait ré-autorisée.
 */
const LocationGate = () => {
  const location = useLocation();

  useEffect(() => {
    if (!("geolocation" in navigator)) return;

    const requestPosition = () => {
      navigator.geolocation.getCurrentPosition(
        () => undefined,
        () => undefined,
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
      );
    };

    const checkAndRequest = async () => {
      try {
        if ("permissions" in navigator) {
          const status = await navigator.permissions.query({
            name: "geolocation" as PermissionName,
          });
          if (status.state === "granted") return;
        }
        requestPosition();
      } catch {
        // Permissions API indisponible : on tente directement.
        requestPosition();
      }
    };

    checkAndRequest();
  }, [location.pathname]);

  return null;
};

export default LocationGate;
