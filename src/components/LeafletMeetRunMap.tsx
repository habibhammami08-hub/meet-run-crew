import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { useGeolocation } from '@/hooks/useGeolocation';
import GeolocationModal from '@/components/GeolocationModal';
import GeolocationBanner from '@/components/GeolocationBanner';
import { useToast } from '@/hooks/use-toast';
import { MapPin, Navigation } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface Session {
  id: string;
  title: string;
  location_lat: number;
  location_lng: number;
  blur_radius_m: number;
  area_hint?: string;
  max_participants: number;
  price_cents: number;
  enrollments?: Array<{
    user_id: string;
    status: string;
  }>;
}

interface LeafletMeetRunMapProps {
  sessions?: Session[];
  onSessionSelect?: (sessionId: string) => void;
  center?: [number, number];
  className?: string;
}

const WELLINGTON_COORDS: [number, number] = [-41.28664, 174.77557];

const LeafletMeetRunMap = ({ 
  sessions = [], 
  onSessionSelect, 
  center,
  className = "" 
}: LeafletMeetRunMapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const userMarker = useRef<L.CircleMarker | null>(null);
  const sessionMarkers = useRef<(L.CircleMarker | L.Circle)[]>([]);
  
  const [showGeolocationModal, setShowGeolocationModal] = useState(false);
  const [showGeolocationBanner, setShowGeolocationBanner] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [userEnrollments, setUserEnrollments] = useState<Array<{session_id: string, status: string}>>([]);
  
  const { position, permission, isLoading, error, requestLocation, hasAsked } = useGeolocation();
  const { toast } = useToast();
  const { user } = useAuth();

  // Fetch user enrollments
  const fetchUserEnrollments = useCallback(async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('enrollments')
      .select('session_id, status')
      .eq('user_id', user.id);
    
    if (!error && data) {
      setUserEnrollments(data);
    }
  }, [user]);

  // Check if user is enrolled and paid for a session
  const isUserPaid = useCallback((sessionId: string) => {
    return userEnrollments.some(e => e.session_id === sessionId && e.status === 'paid');
  }, [userEnrollments]);

  // Initialize map
  const initializeMap = useCallback(() => {
    if (!mapContainer.current || map.current) return;

    const defaultCenter = center || WELLINGTON_COORDS;
    
    map.current = L.map(mapContainer.current, {
      center: defaultCenter,
      zoom: 12,
      zoomControl: true
    });

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map.current);

    // Handle map move/zoom events to reload sessions
    let reloadTimeout: NodeJS.Timeout;
    map.current.on('moveend zoomend', () => {
      clearTimeout(reloadTimeout);
      reloadTimeout = setTimeout(() => {
        // Trigger session reload based on bounds - would be implemented by parent
      }, 300);
    });

    // Handle resize when map becomes visible
    const resizeObserver = new ResizeObserver(() => {
      if (map.current) {
        map.current.invalidateSize();
      }
    });
    
    if (mapContainer.current) {
      resizeObserver.observe(mapContainer.current);
    }

    setHasInitialized(true);
  }, [center]);

  // Update user marker
  const updateUserMarker = useCallback((lat: number, lng: number, accuracy: number) => {
    if (!map.current) return;

    // Remove existing marker
    if (userMarker.current) {
      map.current.removeLayer(userMarker.current);
    }

    // Add user location marker
    userMarker.current = L.circleMarker([lat, lng], {
      radius: 8,
      fillColor: '#1E40AF',
      color: '#ffffff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.8
    }).addTo(map.current);

    userMarker.current.bindPopup(`
      <div class="text-center">
        <h3 class="font-semibold text-sm">Votre position</h3>
        <p class="text-xs text-gray-600">Précision: ${Math.round(accuracy)}m</p>
      </div>
    `);

    // Show accuracy warning if precision is low
    if (accuracy > 1000) {
      toast({
        title: "Position approximative",
        description: `Précision: ${Math.round(accuracy)}m`,
        duration: 3000,
      });
    }
  }, [toast]);

  // Update session markers
  const updateSessionMarkers = useCallback(() => {
    if (!map.current) return;

    // Clear existing markers
    sessionMarkers.current.forEach(marker => {
      map.current!.removeLayer(marker);
    });
    sessionMarkers.current = [];

    // Add new markers for each session
    sessions.forEach(session => {
      const isPaid = isUserPaid(session.id);
      const lat = session.location_lat;
      const lng = session.location_lng;

      if (isPaid) {
        // Show exact location for paid users
        const marker = L.circleMarker([lat, lng], {
          radius: 6,
          fillColor: '#22c55e',
          color: '#ffffff',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.9
        }).addTo(map.current!);

        marker.bindPopup(`
          <div class="p-2">
            <h3 class="font-semibold text-sm">${session.title}</h3>
            <p class="text-xs text-gray-600 mt-1">Point de rencontre exact</p>
            <button 
              class="mt-2 px-3 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600"
              onclick="window.selectSession && window.selectSession('${session.id}')"
            >
              Voir détails
            </button>
          </div>
        `);

        sessionMarkers.current.push(marker);
      } else {
        // Show blurred area for unpaid users
        const radius = session.blur_radius_m || 1000;
        const circle = L.circle([lat, lng], {
          radius: radius,
          fillColor: '#22c55e',
          color: '#22c55e',
          weight: 2,
          opacity: 0.6,
          fillOpacity: 0.1,
          interactive: true
        }).addTo(map.current!);

        circle.bindPopup(`
          <div class="p-2">
            <h3 class="font-semibold text-sm">${session.title}</h3>
            <p class="text-xs text-gray-600 mt-1">
              ${session.area_hint || `Zone approx. ${Math.round(radius/1000)}km`}
            </p>
            <p class="text-xs text-orange-600 mt-1">
              Inscrivez-vous pour voir le lieu exact
            </p>
            <button 
              class="mt-2 px-3 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600"
              onclick="window.selectSession && window.selectSession('${session.id}')"
            >
              S'inscrire - ${(session.price_cents / 100).toFixed(2)}$
            </button>
          </div>
        `);

        sessionMarkers.current.push(circle);
      }
    });

    // Global function for session selection
    (window as any).selectSession = (sessionId: string) => {
      onSessionSelect?.(sessionId);
    };
  }, [sessions, isUserPaid, onSessionSelect]);

  // Handle geolocation responses
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
      map.current.setView([position.latitude, position.longitude], 14);
    } else {
      requestLocation();
    }
  };

  // Initialize map on mount
  useEffect(() => {
    initializeMap();
    
    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [initializeMap]);

  // Fetch user enrollments when user changes
  useEffect(() => {
    fetchUserEnrollments();
  }, [fetchUserEnrollments]);

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
        map.current.setView([position.latitude, position.longitude], 14);
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
  }, [permission, position, hasAsked, hasInitialized, updateUserMarker, toast]);

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

  // Update session markers when sessions or enrollments change
  useEffect(() => {
    if (hasInitialized) {
      updateSessionMarkers();
    }
  }, [sessions, userEnrollments, hasInitialized, updateSessionMarkers]);

  if (!hasInitialized && isLoading) {
    return (
      <div className={`w-full relative bg-sport-gray-light ${className}`} style={{ height: '60vh', minHeight: '60vh' }}>
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
    <div className={`w-full relative ${className}`} style={{ height: '60vh', minHeight: '60vh' }}>
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
        className="absolute bottom-4 right-4 z-[1000] shadow-sport"
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

export default LeafletMeetRunMap;