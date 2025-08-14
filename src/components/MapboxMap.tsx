import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useGeolocation } from '@/hooks/useGeolocation';
import GeolocationModal from '@/components/GeolocationModal';
import GeolocationBanner from '@/components/GeolocationBanner';
import { useToast } from '@/hooks/use-toast';
import { Navigation, MapPin } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface MapboxMapProps {
  onLocationSelect?: (lat: number, lng: number, address: string) => void;
  runs?: Array<{
    id: string;
    latitude: number;
    longitude: number;
    title: string;
  }>;
  onRunSelect?: (runId: string) => void;
  center?: [number, number];
}

const MapboxMap = ({ onLocationSelect, runs = [], onRunSelect, center }: MapboxMapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const userMarker = useRef<mapboxgl.Marker | null>(null);
  const [mapboxToken, setMapboxToken] = useState<string>('');
  const [showTokenInput, setShowTokenInput] = useState(true);
  const [showGeolocationModal, setShowGeolocationModal] = useState(false);
  const [showGeolocationBanner, setShowGeolocationBanner] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
  
  const { position, permission, isLoading, error, requestLocation, hasAsked } = useGeolocation();
  const { toast } = useToast();

  const initializeMap = (token: string, initialCenter?: [number, number]) => {
    if (!mapContainer.current) return;

    if (!token || token.trim() === '') {
      console.error('MAPBOX TOKEN manquant');
      toast({
        title: "Erreur Mapbox",
        description: "Token Mapbox manquant",
        variant: "destructive",
      });
      return;
    }

    mapboxgl.accessToken = token;
    
    const defaultCenter: [number, number] = [174.77557, -41.28664]; // Wellington, NZ
    
    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: center || initialCenter || defaultCenter,
        zoom: 12,
      });

      // Handle map load errors
      map.current.on('error', (e) => {
        console.error('MAPBOX 401/403 – vérifier token ou URL restrictions', e);
        toast({
          title: "Erreur Mapbox",
          description: "Vérifier le token ou les restrictions d'URL",
          variant: "destructive",
        });
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

      // Handle resize when map becomes visible
      map.current.on('load', () => {
        // Create ResizeObserver to handle container size changes
        if (mapContainer.current) {
          const resizeObserver = new ResizeObserver(() => {
            if (map.current) {
              map.current.resize();
            }
          });
          resizeObserver.observe(mapContainer.current);
        }
      });
    } catch (error) {
      console.error('Erreur initialisation Mapbox:', error);
      toast({
        title: "Erreur d'initialisation",
        description: "Impossible d'initialiser la carte Mapbox",
        variant: "destructive",
      });
    }

    // Global function for run selection
    (window as any).selectRun = (runId: string) => {
      onRunSelect?.(runId);
    };

    setHasInitialized(true);
  };

  const handleTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mapboxToken.trim()) {
      localStorage.setItem('mapbox_token', mapboxToken);
      setShowTokenInput(false);
      initializeMap(mapboxToken);
    }
  };

  // Handle geolocation permission responses
  const handleAllowGeolocation = () => {
    setShowGeolocationModal(false);
    requestLocation();
  };

  const handleLaterGeolocation = () => {
    setShowGeolocationModal(false);
    setShowGeolocationBanner(true);
  };

  const handleRetryGeolocation = () => {
    setShowGeolocationBanner(false);
    requestLocation();
  };

  const handleDismissBanner = () => {
    setShowGeolocationBanner(false);
  };

  // Center map on user location
  const centerOnUser = () => {
    if (position && map.current) {
      map.current.flyTo({
        center: [position.longitude, position.latitude],
        zoom: 14
      });
    } else {
      requestLocation();
    }
  };

  // Update user marker position
  const updateUserMarker = (lat: number, lng: number, accuracy: number) => {
    if (!map.current) return;

    // Remove existing marker
    if (userMarker.current) {
      userMarker.current.remove();
    }

    // Add user location marker
    userMarker.current = new mapboxgl.Marker({ 
      color: '#1E40AF',
      scale: 0.8
    })
      .setLngLat([lng, lat])
      .setPopup(
        new mapboxgl.Popup({ offset: 25 }).setHTML(
          `<div class="p-2 text-center">
            <h3 class="font-semibold text-sm">Votre position</h3>
            <p class="text-xs text-gray-600">Précision: ${Math.round(accuracy)}m</p>
          </div>`
        )
      )
      .addTo(map.current);

    // Add accuracy circle if precision is low
    if (accuracy > 1000) {
      toast({
        title: "Position approximative",
        description: `Précision: ${Math.round(accuracy)}m`,
        duration: 3000,
      });
    }
  };

  // Initialize map and geolocation
  useEffect(() => {
    const savedToken = localStorage.getItem('mapbox_token');
    if (savedToken) {
      setMapboxToken(savedToken);
      setShowTokenInput(false);
      initializeMap(savedToken);
    }

    return () => {
      map.current?.remove();
      userMarker.current?.remove();
    };
  }, []);

  // Handle geolocation state changes
  useEffect(() => {
    if (!hasInitialized) return;

    // Show modal on first visit if permission is prompt
    if (permission === 'prompt' && !hasAsked) {
      setShowGeolocationModal(true);
    }

    // Handle permission granted
    if (permission === 'granted' && position) {
      updateUserMarker(position.latitude, position.longitude, position.accuracy);
      
      // Center map on user location if this is the first time
      if (!hasAsked && map.current) {
        map.current.flyTo({
          center: [position.longitude, position.latitude],
          zoom: 14
        });
      }

      toast({
        title: "Position détectée",
        description: "Sessions près de vous",
        duration: 3000,
      });
    }

    // Handle permission denied
    if (permission === 'denied' && hasAsked) {
      setShowGeolocationBanner(true);
      toast({
        title: "Impossible d'obtenir votre position",
        description: "Affichage par défaut : Wellington.",
        variant: "destructive",
        duration: 4000,
      });
    }
  }, [permission, position, hasAsked, hasInitialized]);

  // Handle geolocation errors
  useEffect(() => {
    if (error) {
      toast({
        title: "Erreur de géolocalisation",
        description: error,
        variant: "destructive",
        duration: 4000,
      });
    }
  }, [error, toast]);

  if (showTokenInput) {
    return (
      <div className="h-full flex items-center justify-center bg-sport-gray-light">
        <div className="bg-card p-6 rounded-lg shadow-card max-w-md w-full mx-4">
          <h3 className="text-lg font-semibold mb-4 text-sport-black">Configuration Mapbox</h3>
          <p className="text-sm text-sport-gray mb-4">
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
          <p className="text-xs text-sport-gray mt-2">
            Obtenez votre token sur{' '}
            <a href="https://mapbox.com" target="_blank" rel="noopener noreferrer" className="text-sport-green underline">
              mapbox.com
            </a>
          </p>
        </div>
      </div>
    );
  }

  if (!hasInitialized && isLoading) {
    return (
      <div className="w-full h-full relative bg-sport-gray-light">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="animate-pulse-sport">
              <Navigation className="h-8 w-8 text-sport-green mx-auto" />
            </div>
            <p className="text-sport-gray text-sm">Recherche de votre position…</p>
          </div>
        </div>
        <Skeleton className="w-full h-full" />
      </div>
    );
  }

  return (
    <div className="w-full relative" style={{ height: '60vh', minHeight: '60vh' }}>
      {/* Geolocation Modal */}
      <GeolocationModal
        isOpen={showGeolocationModal}
        onAllow={handleAllowGeolocation}
        onLater={handleLaterGeolocation}
      />

      {/* Geolocation Banner */}
      <GeolocationBanner
        isVisible={showGeolocationBanner}
        onRetry={handleRetryGeolocation}
        onDismiss={handleDismissBanner}
      />

      {/* Map Container */}
      <div 
        ref={mapContainer} 
        className="w-full h-full"
        style={{ width: '100%', height: '100%' }}
      />

      {/* Locate Me Button */}
      <Button
        variant="sport"
        size="icon"
        className="absolute bottom-4 right-4 z-10 shadow-sport"
        onClick={centerOnUser}
        disabled={isLoading}
        title="Me localiser"
      >
        {isLoading ? (
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-background border-t-transparent" />
        ) : (
          <MapPin className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
};

export default MapboxMap;