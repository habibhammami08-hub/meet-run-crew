import { PropsWithChildren } from "react";
import { useJsApiLoader } from "@react-google-maps/api";

const libraries = ["places", "geometry"] as any;

export default function GoogleMapProvider({ children }: PropsWithChildren) {
  const apiKey =
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY ||
    (window as any)?.__ENV?.VITE_GOOGLE_MAPS_API_KEY ||
    "AIzaSyCvdNxllRh_LB91gtUEalOO8SfAEIT28WI";

  const { isLoaded, loadError } = useJsApiLoader({
    id: "meetrun-gmaps-loader",
    googleMapsApiKey: apiKey!,
    libraries,
  });

  if (loadError) {
    if (import.meta.env.DEV) console.error("[maps] loadError", loadError);
    return <div className="p-4 text-sm text-red-600">Erreur de chargement Google Maps.</div>;
  }
  if (!isLoaded) {
    return <div className="p-4 text-sm text-muted-foreground">Chargement de la carte…</div>;
  }
  return <>{children}</>;
}