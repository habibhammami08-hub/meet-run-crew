import { useState, useEffect, useCallback } from "react";
import { GoogleMap, Marker, Polyline } from "@react-google-maps/api";
import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Locate } from "lucide-react";


type Pt = google.maps.LatLngLiteral;

interface Session {
  id: string;
  title: string;
  start_lat: number;
  start_lng: number;
  end_lat?: number;
  end_lng?: number;
  route_polyline?: string;
  distance_km: number;
  scheduled_at: string;
  host_name?: string;
  current_enrollments?: number;
  max_participants: number;
  price_cents?: number;
}

interface GoogleSessionsMapProps {
  sessions: Session[];
  onSessionSelect?: (session: Session) => void;
  center?: Pt;
  className?: string;
}

// Jitter function for non-subscribers (obfuscation)
function jitter(lat: number, lng: number, meters = 800): Pt {
  const r = meters / 111320; // Convert meters to degrees
  const u = Math.random();
  const v = Math.random();
  const w = r * Math.sqrt(u);
  const t = 2 * Math.PI * v;
  return {
    lat: lat + w * Math.cos(t),
    lng: lng + w * Math.sin(t)
  };
}

// Decode polyline (simple implementation for overview_polyline)
function decodePolyline(encoded: string): Pt[] {
  const poly = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    poly.push({
      lat: lat * 1e-5,
      lng: lng * 1e-5
    });
  }
  return poly;
}

export default function GoogleSessionsMap({ 
  sessions, 
  onSessionSelect, 
  center = { lat: 48.8566, lng: 2.3522 },
  className = ""
}: GoogleSessionsMapProps) {
  const { user } = useAuth();
  const [userLocation, setUserLocation] = useState<Pt | null>(null);
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const supabase = getSupabase();

  // Check user subscription status
  useEffect(() => {
    async function checkSubscription() {
      if (!user || !supabase) return;
      
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('sub_status, sub_current_period_end')
          .eq('id', user.id)
          .single();
        
        if (profile) {
          const isActive = profile.sub_status === 'active' && 
            (!profile.sub_current_period_end || new Date(profile.sub_current_period_end) > new Date());
          setHasActiveSubscription(isActive);
        }
      } catch (error) {
        console.error('Error checking subscription:', error);
      }
    }
    
    checkSubscription();
  }, [user, supabase]);

  const requestLocation = useCallback(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.error("Geolocation error:", error);
        }
      );
    }
  }, []);

  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className={`relative ${className || ''}`}>
      <GoogleMap
        mapContainerStyle={{ width: "100%", height: "100%" }}
        zoom={12}
        center={userLocation || center}
        options={{
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false
        }}
      >
        {/* User location marker */}
        {userLocation && (
          <Marker
            position={userLocation}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: "#3b82f6",
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 3
            }}
          />
        )}

        {/* Session markers and routes */}
        {sessions.map((session) => {
          const startPos = { lat: session.start_lat, lng: session.start_lng };
          const displayPos = hasActiveSubscription ? startPos : jitter(startPos.lat, startPos.lng);
          
          return (
            <div key={session.id}>
              {/* Start marker */}
              <Marker
                position={displayPos}
                onClick={() => onSessionSelect?.(session)}
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 10,
                  fillColor: "#10b981",
                  fillOpacity: 1,
                  strokeColor: "#ffffff",
                  strokeWeight: 2
                }}
              />

              {/* Route polyline for subscribers only */}
              {hasActiveSubscription && session.route_polyline && (
                <Polyline
                  path={decodePolyline(session.route_polyline)}
                  options={{
                    strokeColor: "#10b981",
                    strokeOpacity: 0.8,
                    strokeWeight: 3
                  }}
                />
              )}

              {/* End marker for subscribers */}
              {hasActiveSubscription && session.end_lat && session.end_lng && (
                <Marker
                  position={{ lat: session.end_lat, lng: session.end_lng }}
                  icon={{
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 8,
                    fillColor: "#ef4444",
                    fillOpacity: 1,
                    strokeColor: "#ffffff",
                    strokeWeight: 2
                  }}
                />
              )}
            </div>
          );
        })}
      </GoogleMap>

      {/* Locate me button */}
      <Button
        variant="outline"
        size="icon"
        className="absolute top-4 right-4 bg-background shadow-lg"
        onClick={requestLocation}
      >
        <Locate className="h-4 w-4" />
      </Button>

      {/* Subscription notice for non-subscribers */}
      {!hasActiveSubscription && (
        <div className="absolute bottom-4 left-4 right-4 bg-background/90 backdrop-blur-sm rounded-lg p-3 border">
          <p className="text-sm text-muted-foreground text-center">
            🔒 Abonnez-vous pour voir les itinéraires précis et les points d'arrivée
          </p>
        </div>
      )}
    </div>
  );
}