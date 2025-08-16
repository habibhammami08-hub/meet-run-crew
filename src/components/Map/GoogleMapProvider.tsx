import { LoadScript } from "@react-google-maps/api";
import { PropsWithChildren, useMemo, useState } from "react";

function getApiKey(): string | undefined {
  // Clé API directe car les variables VITE_* ne sont pas supportées par Lovable
  return "AIzaSyCvdNxllRh_LB91gtUEalOO8SfAEIT28WI";
}

export default function GoogleMapProvider({ children }: PropsWithChildren) {
  const apiKey = getApiKey();
  const libraries = useMemo(() => (["places", "geometry"] as any), []);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  if (!apiKey) {
    return (
      <div className="p-6 text-center">
        <h2 className="text-lg font-semibold">Clé Google Maps manquante</h2>
        <p className="text-sm text-muted-foreground mt-2">
          Définissez VITE_GOOGLE_MAPS_API_KEY dans les variables d'environnement Lovable (ou public/env.js).
        </p>
      </div>
    );
  }

  return (
    <>
      <LoadScript
        googleMapsApiKey={apiKey}
        libraries={libraries}
        onLoad={() => {
          if (import.meta.env.DEV) console.log("[Maps] SDK loaded");
          setLoaded(true);
        }}
        onError={(e) => {
          console.error("[Maps] load error", e);
          setErr("Erreur de chargement du SDK Google Maps. Vérifiez la clé, les domaines autorisés et les APIs.");
        }}
      >
        {err ? (
          <div className="p-6 text-center">
            <h2 className="text-lg font-semibold">Impossible de charger la carte</h2>
            <p className="text-sm text-muted-foreground mt-2">{err}</p>
            <ul className="text-sm mt-3 text-left inline-block">
              <li>• Autoriser le domaine courant dans la clé (HTTP referrer)</li>
              <li>• Restreindre la clé aux APIs: Maps JavaScript, Places, Directions</li>
              <li>• Activer ces APIs dans GCP</li>
            </ul>
          </div>
        ) : (
          children
        )}
      </LoadScript>
    </>
  );
}