import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default markers in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom green icon for run markers
const runIcon = new L.Icon({
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
  className: 'run-marker'
});

interface LeafletMapProps {
  onLocationSelect?: (lat: number, lng: number, address: string) => void;
  runs?: Array<{
    id: string;
    latitude: number;
    longitude: number;
    title: string;
  }>;
  onRunSelect?: (runId: string) => void;
}

// Component to handle map clicks
const MapClickHandler = ({ onLocationSelect }: { onLocationSelect?: LeafletMapProps['onLocationSelect'] }) => {
  useMapEvents({
    click: async (e) => {
      if (onLocationSelect) {
        const { lat, lng } = e.latlng;
        
        // Reverse geocoding using Nominatim (OpenStreetMap)
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`
          );
          const data = await response.json();
          const address = data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          
          onLocationSelect(lat, lng, address);
        } catch (error) {
          console.error('Geocoding error:', error);
          onLocationSelect(lat, lng, `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        }
      }
    },
  });
  return null;
};

const LeafletMap = ({ onLocationSelect, runs = [], onRunSelect }: LeafletMapProps) => {
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    // Custom CSS for run markers
    const style = document.createElement('style');
    style.textContent = `
      .run-marker {
        filter: hue-rotate(120deg) saturate(1.5);
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  return (
    <div className="w-full h-full">
      <MapContainer
        center={[-41.2865, 174.7762]} // Wellington, NZ
        zoom={12}
        style={{ height: '100%', width: '100%' }}
        ref={mapRef}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {/* Map click handler */}
        <MapClickHandler onLocationSelect={onLocationSelect} />
        
        {/* Run markers */}
        {runs.map((run) => (
          <Marker
            key={run.id}
            position={[run.latitude, run.longitude]}
            icon={runIcon}
          >
            <Popup>
              <div className="p-2">
                <h3 className="font-semibold text-sm">{run.title}</h3>
                <button
                  className="mt-2 px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600"
                  onClick={() => onRunSelect?.(run.id)}
                >
                  Voir détails
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};

export default LeafletMap;