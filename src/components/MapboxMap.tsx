import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface MapboxMapProps {
  onLocationSelect?: (lat: number, lng: number, address: string) => void;
  runs?: Array<{
    id: string;
    latitude: number;
    longitude: number;
    title: string;
  }>;
  onRunSelect?: (runId: string) => void;
}

const MapboxMap = ({ onLocationSelect, runs = [], onRunSelect }: MapboxMapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapboxToken, setMapboxToken] = useState<string>('');
  const [showTokenInput, setShowTokenInput] = useState(true);

  const initializeMap = (token: string) => {
    if (!mapContainer.current) return;

    mapboxgl.accessToken = token;
    
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [174.7762, -41.2865], // Wellington, NZ
      zoom: 12,
    });

    // Add navigation controls
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    // Add click handler for location selection
    if (onLocationSelect) {
      map.current.on('click', async (e) => {
        const { lng, lat } = e.lngLat;
        
        // Reverse geocoding to get address
        try {
          const response = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}`
          );
          const data = await response.json();
          const address = data.features[0]?.place_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          
          onLocationSelect(lat, lng, address);
        } catch (error) {
          console.error('Geocoding error:', error);
          onLocationSelect(lat, lng, `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        }
      });
    }

    // Add run markers
    runs.forEach((run) => {
      const marker = new mapboxgl.Marker({ color: '#22c55e' })
        .setLngLat([run.longitude, run.latitude])
        .setPopup(
          new mapboxgl.Popup({ offset: 25 }).setHTML(
            `<div class="p-2">
              <h3 class="font-semibold">${run.title}</h3>
              <button class="mt-2 px-3 py-1 bg-green-500 text-white rounded text-sm" onclick="window.selectRun('${run.id}')">
                Voir détails
              </button>
            </div>`
          )
        )
        .addTo(map.current!);
    });

    // Global function for run selection
    (window as any).selectRun = (runId: string) => {
      onRunSelect?.(runId);
    };
  };

  const handleTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mapboxToken.trim()) {
      localStorage.setItem('mapbox_token', mapboxToken);
      setShowTokenInput(false);
      initializeMap(mapboxToken);
    }
  };

  useEffect(() => {
    const savedToken = localStorage.getItem('mapbox_token');
    if (savedToken) {
      setMapboxToken(savedToken);
      setShowTokenInput(false);
      initializeMap(savedToken);
    }

    return () => {
      map.current?.remove();
    };
  }, []);

  if (showTokenInput) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-100">
        <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full mx-4">
          <h3 className="text-lg font-semibold mb-4">Configuration Mapbox</h3>
          <p className="text-sm text-gray-600 mb-4">
            Entrez votre token public Mapbox pour activer la carte interactive.
          </p>
          <form onSubmit={handleTokenSubmit} className="space-y-4">
            <Input
              type="text"
              placeholder="pk.eyJ1Ijoi..."
              value={mapboxToken}
              onChange={(e) => setMapboxToken(e.target.value)}
              required
            />
            <Button type="submit" variant="sport" className="w-full">
              Activer la carte
            </Button>
          </form>
          <p className="text-xs text-gray-500 mt-2">
            Obtenez votre token sur{' '}
            <a href="https://mapbox.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">
              mapbox.com
            </a>
          </p>
        </div>
      </div>
    );
  }

  return <div ref={mapContainer} className="w-full h-full" />;
};

export default MapboxMap;