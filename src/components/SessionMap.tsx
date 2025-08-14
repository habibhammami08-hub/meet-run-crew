import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Navigation } from "lucide-react";
import GeolocationModal from "./GeolocationModal";
import GeolocationBanner from "./GeolocationBanner";

// Fix for default markers in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

interface Session {
  id: string;
  title: string;
  date: string;
  location_lat: number;
  location_lng: number;
  end_lat?: number;
  end_lng?: number;
  blur_radius_m: number;
  price_cents: number;
  max_participants: number;
  distance_km: number;
  intensity: string;
  type: string;
  host_id: string;
  area_hint?: string;
  enrollments?: Array<{ user_id: string; status: string }>;
}

interface SessionMapProps {
  sessions: Session[];
  onSessionSelect?: (sessionId: string) => void;
  center?: [number, number];
  className?: string;
}

const SessionMap = ({ sessions, onSessionSelect, center, className }: SessionMapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const userMarker = useRef<L.Marker | null>(null);
  const sessionMarkers = useRef<L.LayerGroup | null>(null);
  
  const [showGeolocationModal, setShowGeolocationModal] = useState(false);
  const [showGeolocationBanner, setShowGeolocationBanner] = useState(false);
  const [mapInitialized, setMapInitialized] = useState(false);
  const [userEnrollments, setUserEnrollments] = useState<Array<{ session_id: string; status: string }>>([]);
  const [hasAskedForLocation, setHasAskedForLocation] = useState(false);

  const {
    position,
    permission,
    isLoading: geolocationLoading,
    error: geolocationError,
    requestLocation,
    hasAsked: geolocationHasAsked
  } = useGeolocation();
  
  const { user } = useAuth();

  // Fetch user enrollments
  const fetchUserEnrollments = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('enrollments')
      .select('session_id, status')
      .eq('user_id', user.id);
    
    if (!error) {
      setUserEnrollments(data || []);
    }
  };

  // Check if user has paid for a session
  const isUserPaid = (sessionId: string): boolean => {
    return userEnrollments.some(
      enrollment => enrollment.session_id === sessionId && enrollment.status === 'paid'
    );
  };

  // Check if user is host of a session
  const isUserHost = (sessionHostId: string): boolean => {
    return user?.id === sessionHostId;
  };

  // Initialize map
  const initializeMap = () => {
    if (!mapContainer.current || map.current) return;

    const defaultCenter: [number, number] = center || [-41.28664, 174.77557];
    const leafletMap = L.map(mapContainer.current).setView(defaultCenter, 12);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(leafletMap);

    map.current = leafletMap;
    sessionMarkers.current = L.layerGroup().addTo(leafletMap);
    setMapInitialized(true);

    // Add event listeners
    leafletMap.on('moveend', debounce(handleMapChange, 300));
    leafletMap.on('zoomend', debounce(handleMapChange, 300));

    // Trigger initial geolocation request
    if (!hasAskedForLocation && !geolocationHasAsked) {
      setHasAskedForLocation(true);
      requestLocation();
    }
  };

  // Debounce function
  const debounce = (func: Function, wait: number) => {
    let timeout: NodeJS.Timeout;
    return function executedFunction(...args: any[]) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };

  // Handle map changes (move/zoom)
  const handleMapChange = () => {
    if (!map.current) return;
    
    const bounds = map.current.getBounds();
    // Here you could fetch sessions within bounds if needed
    console.log('Map bounds changed:', bounds);
  };

  // Update user marker
  const updateUserMarker = (lat: number, lng: number, accuracy?: number) => {
    if (!map.current) return;

    // Remove existing user marker
    if (userMarker.current) {
      map.current.removeLayer(userMarker.current);
    }

    // Create user location marker (blue dot)
    const userIcon = L.divIcon({
      html: `
        <div style="
          width: 20px; 
          height: 20px; 
          background-color: #3b82f6; 
          border: 3px solid white; 
          border-radius: 50%; 
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        "></div>
      `,
      className: 'user-location-marker',
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });

    userMarker.current = L.marker([lat, lng], { icon: userIcon }).addTo(map.current);

    // Add accuracy circle if available
    if (accuracy && accuracy < 1000) {
      L.circle([lat, lng], {
        radius: accuracy,
        fillColor: '#3b82f6',
        fillOpacity: 0.1,
        color: '#3b82f6',
        weight: 1,
      }).addTo(map.current);
    }

    // Add popup
    userMarker.current.bindPopup("Votre position");
  };

  // Update session markers
  const updateSessionMarkers = () => {
    if (!map.current || !sessionMarkers.current) return;

    // Clear existing markers
    sessionMarkers.current.clearLayers();

    sessions.forEach((session) => {
      const isPaid = isUserPaid(session.id);
      const isHost = isUserHost(session.host_id);
      const canSeeExactLocation = isPaid || isHost;

      if (canSeeExactLocation) {
        // Show exact location markers
        
        // Start marker (green)
        const startIcon = L.divIcon({
          html: `
            <div style="
              width: 16px; 
              height: 16px; 
              background-color: #22c55e; 
              border: 2px solid white; 
              border-radius: 50%; 
              box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            "></div>
          `,
          className: 'session-start-marker',
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        });

        const startMarker = L.marker([session.location_lat, session.location_lng], { 
          icon: startIcon 
        });

        startMarker.on('click', () => {
          if (onSessionSelect) {
            onSessionSelect(session.id);
          }
        });

        startMarker.bindPopup(`
          <div class="p-2">
            <h4 class="font-semibold">${session.title}</h4>
            <p class="text-sm text-gray-600">Point de départ</p>
            <p class="text-xs">${session.distance_km}km • ${session.intensity}</p>
          </div>
        `);

        sessionMarkers.current!.addLayer(startMarker);

        // End marker (red) if exists
        if (session.end_lat && session.end_lng) {
          const endIcon = L.divIcon({
            html: `
              <div style="
                width: 16px; 
                height: 16px; 
                background-color: #ef4444; 
                border: 2px solid white; 
                border-radius: 50%; 
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
              "></div>
            `,
            className: 'session-end-marker',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
          });

          const endMarker = L.marker([session.end_lat, session.end_lng], { 
            icon: endIcon 
          });

          endMarker.bindPopup(`
            <div class="p-2">
              <h4 class="font-semibold">${session.title}</h4>
              <p class="text-sm text-gray-600">Point d'arrivée</p>
            </div>
          `);

          sessionMarkers.current!.addLayer(endMarker);
        }

      } else {
        // Show blurred area (circle)
        const blurRadius = session.blur_radius_m || 1000;
        
        const blurCircle = L.circle([session.location_lat, session.location_lng], {
          radius: blurRadius,
          fillColor: '#f59e0b',
          fillOpacity: 0.2,
          color: '#f59e0b',
          weight: 2,
          interactive: true
        });

        blurCircle.on('click', () => {
          if (onSessionSelect) {
            onSessionSelect(session.id);
          }
        });

        blurCircle.bindPopup(`
          <div class="p-2">
            <h4 class="font-semibold">${session.title}</h4>
            <p class="text-sm text-gray-600">Zone approximative (${Math.round(blurRadius/1000)}km)</p>
            <p class="text-xs">${session.distance_km}km • ${session.intensity}</p>
            <p class="text-xs mt-1 text-orange-600">Inscrivez-vous pour voir le lieu exact</p>
          </div>
        `);

        sessionMarkers.current!.addLayer(blurCircle);
      }
    });
  };

  // Geolocation handlers
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

  // Center map on user
  const centerOnUser = () => {
    if (position && map.current) {
      map.current.setView([position.latitude, position.longitude], 15);
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
  }, []);

  // Fetch user enrollments when user changes
  useEffect(() => {
    if (user) {
      fetchUserEnrollments();
    }
  }, [user]);

  // Handle geolocation permission and update user marker
  useEffect(() => {
    if (permission === 'prompt' && !showGeolocationModal && !geolocationHasAsked && mapInitialized) {
      setShowGeolocationModal(true);
    }

    if (position && map.current) {
      updateUserMarker(position.latitude, position.longitude, position.accuracy);
      
      // Center map on user location on first successful geolocation
      if (!hasAskedForLocation) {
        map.current.setView([position.latitude, position.longitude], 15);
        setHasAskedForLocation(true);
      }
    }

    if (permission === 'denied' && mapInitialized) {
      setShowGeolocationBanner(true);
    }
  }, [permission, position, mapInitialized, geolocationHasAsked]);

  // Handle geolocation errors
  useEffect(() => {
    if (geolocationError && mapInitialized) {
      setShowGeolocationBanner(true);
    }
  }, [geolocationError, mapInitialized]);

  // Update session markers when sessions or enrollments change
  useEffect(() => {
    if (mapInitialized) {
      updateSessionMarkers();
    }
  }, [sessions, userEnrollments, mapInitialized, user]);

  if (!mapInitialized && geolocationLoading) {
    return (
      <div className="w-full h-96 bg-gray-100 animate-pulse rounded-lg flex items-center justify-center">
        <div className="text-gray-500">Chargement de la carte...</div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {/* Map container */}
      <div ref={mapContainer} className="w-full h-full min-h-96" />
      
      {/* Geolocation Modal */}
      {showGeolocationModal && (
        <GeolocationModal
          isOpen={showGeolocationModal}
          onAllow={handleAllowGeolocation}
          onLater={handleLaterGeolocation}
        />
      )}
      
      {/* Geolocation Banner */}
      {showGeolocationBanner && (
        <GeolocationBanner
          isVisible={showGeolocationBanner}
          onRetry={handleRetryGeolocation}
          onDismiss={handleDismissBanner}
        />
      )}
      
      {/* Locate Me Button */}
      <Button
        variant="secondary"
        size="sm"
        className="absolute bottom-4 right-4 z-[1000] shadow-lg"
        onClick={centerOnUser}
      >
        <Navigation size={16} />
      </Button>
    </div>
  );
};

export default SessionMap;