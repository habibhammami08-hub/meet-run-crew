import { LoadScript } from "@react-google-maps/api";
import { PropsWithChildren, useMemo } from "react";

export default function GoogleMapProvider({ children }: PropsWithChildren) {
  const apiKey = "AIzaSyCvdNxllRh_LB91gtUEalOO8SfAEIT28WI";
  const libraries = useMemo(() => (["places", "geometry"] as any), []);
  
  return (
    <LoadScript googleMapsApiKey={apiKey} libraries={libraries}>
      {children}
    </LoadScript>
  );
}