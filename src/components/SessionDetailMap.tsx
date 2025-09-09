import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, Navigation } from "lucide-react";

// Import marker icons
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Configure default marker icons
const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface SessionDetailMapProps {
  startLat: number;
  startLng: number;
  endLat?: number;
  endLng?: number;
  startPlace?: string;
  endPlace?: string;
  canSeeExactLocation: boolean;
  blurRadiusM?: number;
  className?: string;
}

// Deterministic jittering function (same as in Map.tsx)
function seededNoise(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return (hash % 10000) / 10000; // Return value between 0 and 1
}

function jitterDeterministic(lat: number, lng: number, meters: number, seed: string): [number, number] {
  const angle = seededNoise(seed + "_angle") * 2 * Math.PI;
  const distance = seededNoise(seed + "_distance") * meters;
  
  // Convert distance in meters to degrees (approximate)
  const latOffset = (distance * Math.cos(angle)) / 111320;
  const lngOffset = (distance * Math.sin(angle)) / (111320 * Math.cos(lat * Math.PI / 180));
  
  return [lat + latOffset, lng + lngOffset];
}

const SessionDetailMap = ({
  startLat,
  startLng,
  endLat,
  endLng,
  startPlace,
  endPlace,
  canSeeExactLocation,
  blurRadiusM = 800,
  className = "h-64"
}: SessionDetailMapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const [mapInitialized, setMapInitialized] = useState(false);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    // Initialize map
    const leafletMap = L.map(mapContainer.current);
    
    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(leafletMap);

    map.current = leafletMap;
    setMapInitialized(true);

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!map.current || !mapInitialized) return;

    // Clear existing markers
    map.current.eachLayer((layer) => {
      if (layer instanceof L.Marker || layer instanceof L.Circle) {
        map.current?.removeLayer(layer);
      }
    });

    const bounds = L.latLngBounds([]);

    // Add start marker
    let displayStartLat = startLat;
    let displayStartLng = startLng;

    if (!canSeeExactLocation) {
      // Apply jittering for non-subscribers
      [displayStartLat, displayStartLng] = jitterDeterministic(
        startLat,
        startLng,
        blurRadiusM,
        `${startLat}_${startLng}_start`
      );

      // Add blur circle
      const blurCircle = L.circle([displayStartLat, displayStartLng], {
        radius: blurRadiusM,
        color: '#ef4444',
        fillColor: '#fef2f2',
        fillOpacity: 0.3,
        weight: 2,
        opacity: 0.8
      });
      blurCircle.addTo(map.current);
      blurCircle.bindPopup(`Zone approximative de départ (${blurRadiusM}m)`);
    }

    // Create custom start icon
    const startIcon = L.divIcon({
      className: 'custom-start-marker',
      html: `<div style="background-color: #22c55e; color: white; border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
          <circle cx="12" cy="10" r="3"></circle>
        </svg>
      </div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 30]
    });

    const startMarker = L.marker([displayStartLat, displayStartLng], { icon: startIcon });
    startMarker.addTo(map.current);
    
    const startPopupContent = canSeeExactLocation 
      ? (startPlace || "Point de départ")
      : "Point de départ approximatif";
    startMarker.bindPopup(startPopupContent);
    
    bounds.extend([displayStartLat, displayStartLng]);

    // Add end marker if coordinates exist
    if (endLat !== undefined && endLng !== undefined) {
      // Create custom end icon
      const endIcon = L.divIcon({
        className: 'custom-end-marker',
        html: `<div style="background-color: #ef4444; color: white; border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z"></path>
            <path d="m8 7 4-4 4 4"></path>
          </svg>
        </div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 30]
      });

      const endMarker = L.marker([endLat, endLng], { icon: endIcon });
      endMarker.addTo(map.current);
      endMarker.bindPopup(endPlace || "Point d'arrivée");
      bounds.extend([endLat, endLng]);

      // Draw route line if both points exist
      const routeLine = L.polyline([[displayStartLat, displayStartLng], [endLat, endLng]], {
        color: '#3b82f6',
        weight: 3,
        opacity: 0.7,
        dashArray: '5, 10'
      });
      routeLine.addTo(map.current);
    }

    // Fit map to bounds with padding
    if (bounds.isValid()) {
      map.current.fitBounds(bounds, { padding: [20, 20] });
    } else {
      map.current.setView([displayStartLat, displayStartLng], 14);
    }

  }, [startLat, startLng, endLat, endLng, startPlace, endPlace, canSeeExactLocation, blurRadiusM, mapInitialized]);

  return (
    <div className={`relative ${className}`}>
      <div ref={mapContainer} className="w-full h-full rounded-lg" />
      
      {/* Legend */}
      <div className="absolute top-2 left-2 bg-white/90 backdrop-blur-sm rounded-lg p-2 text-xs space-y-1 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
          <span>Départ {!canSeeExactLocation ? "(~)" : ""}</span>
        </div>
        {endLat !== undefined && endLng !== undefined && (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            <span>Arrivée</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionDetailMap;