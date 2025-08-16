import { LoadScript } from "@react-google-maps/api";
import { PropsWithChildren, useMemo } from "react";

export default function GoogleMapProvider({ children }: PropsWithChildren) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY!;
  const libraries = useMemo(() => (["places", "geometry"] as any), []);
  
  return (
    <LoadScript googleMapsApiKey={apiKey} libraries={libraries}>
      {children}
    </LoadScript>
  );
}