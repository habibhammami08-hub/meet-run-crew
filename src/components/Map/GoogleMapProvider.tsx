import { LoadScript } from "@react-google-maps/api";
import { PropsWithChildren, useMemo } from "react";

export default function GoogleMapProvider({ children }: PropsWithChildren) {
  const apiKey = "AIzaSyCvdNxllRh_LB91gtUEalOO8SfAEIT28WI";
  const libraries = useMemo(() => (["places", "geometry"] as any), []);
  
  console.log("[GoogleMapProvider] Loading with API key:", apiKey ? "Present" : "Missing");
  console.log("[GoogleMapProvider] Current URL:", window.location.href);
  
  return (
    <LoadScript 
      googleMapsApiKey={apiKey} 
      libraries={libraries}
      onLoad={() => console.log("[GoogleMapProvider] Google Maps loaded successfully")}
      onError={(error) => console.error("[GoogleMapProvider] Google Maps load error:", error)}
    >
      {children}
    </LoadScript>
  );
}