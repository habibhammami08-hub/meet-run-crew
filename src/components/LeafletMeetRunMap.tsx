import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/leaflet.markercluster.js';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
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
  date: string;
  location_lat: number;
  location_lng: number;
  blur_radius_m: number;
  area_hint?: string;
  max_participants: number;
  price_cents: number;
  distance_km: number;
  intensity: string;
  host_id: string;
  host_profile?: {
    full_name?: string;
    avatar_url?: string;
    age?: number;
  };
  enrollments?: Array<{
    user_id: string;
    status: string;
    profile?: {
      full_name?: string;
      avatar_url?: string;
      age?: number;
    };
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
  const clusterGroup = useRef<any>(null);
  
  const [showGeolocationModal, setShowGeolocationModal] = useState(false);
  const [showGeolocationBanner, setShowGeolocationBanner] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [userEnrollments, setUserEnrollments] = useState<Array<{session_id: string, status: string}>>([]);
  const [hasAskedGeolocation, setHasAskedGeolocation] = useState(false);
  
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

  // Check if user is host of a session
  const isUserHost = useCallback((session: Session) => {
    return user?.id === session.host_id;
  }, [user]);

  // Convert meters to pixels for clustering
  const metersToPixels = useCallback((meters: number, lat: number, zoom: number) => {
    const metersPerPixel = (156543.03392 * Math.cos(lat * Math.PI / 180)) / Math.pow(2, zoom);
    return meters / metersPerPixel;
  }, []);

  // Constants for green styling
  const GREEN = "#059669"; // Darker green for better visibility
  
  // Create cluster icon
  const createClusterIcon = useCallback((cluster: any) => {
    const count = cluster.getChildCount();
    const size = count < 5 ? 24 : count < 12 ? 30 : 38;
    return L.divIcon({
      html: `<div style="
        width:${size}px;height:${size}px;border-radius:50%;
        background:${GREEN};display:flex;align-items:center;justify-content:center;
        color:#fff;font-weight:700;font-size:12px;
        box-shadow:0 2px 8px rgba(0,0,0,.25)
      ">${count}</div>`,
      className: "cluster-green",
      iconSize: [size, size]
    });
  }, []);

  // Get display coordinates (exact or blurred)
  const getDisplayLatLng = useCallback((session: Session, canSeeExact: boolean) => {
    if (canSeeExact) {
      return { lat: session.location_lat, lng: session.location_lng };
    }
    
    // Simple jitter for demo - in production you'd use proper geohash/blur
    const jitterAmount = 0.005; // ~500m
    const jitterLat = (Math.random() - 0.5) * jitterAmount;
    const jitterLng = (Math.random() - 0.5) * jitterAmount;
    
    return {
      lat: session.location_lat + jitterLat,
      lng: session.location_lng + jitterLng
    };
  }, []);

  // Calculate distance between two points in meters
  const haversineMeters = useCallback((a: L.LatLng, b: L.LatLng) => {
    const R = 6371000;
    const dLat = (b.lat - a.lat) * Math.PI/180;
    const dLng = (b.lng - a.lng) * Math.PI/180;
    const la1 = a.lat * Math.PI/180, la2 = b.lat * Math.PI/180;
    const A = Math.sin(dLat/2)**2 + Math.sin(dLng/2)**2 * Math.cos(la1)*Math.cos(la2);
    return 2 * R * Math.asin(Math.sqrt(A));
  }, []);

  // Format date for display
  const formatDate = useCallback((dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }, []);

  // Open session details
  const openSessionDetails = useCallback((sessionId: string) => {
    onSessionSelect?.(sessionId);
  }, [onSessionSelect]);

  // Initialize map
  const initializeMap = useCallback(() => {
    if (!mapContainer.current || map.current) return;

    // Always center on Wellington initially, then update based on geolocation
    const defaultCenter = WELLINGTON_COORDS;
    
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

    // Initialize cluster group
    clusterGroup.current = (L as any).markerClusterGroup({
      spiderfyOnMaxZoom: false,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: false,
      iconCreateFunction: createClusterIcon,
      maxClusterRadius: (zoom: number) => {
        const lat = map.current?.getCenter().lat || -41.28664;
        return Math.round(metersToPixels(300, lat, zoom));
      },
    });
    map.current.addLayer(clusterGroup.current);

    // Handle cluster clicks
    clusterGroup.current.on('clusterclick', (e: any) => {
      const center = e.layer.getLatLng();
      const children = e.layer.getAllChildMarkers();
      
      // Filter sessions within 300m of cluster center
      const items = children
        .filter((m: any) => haversineMeters(center, m.getLatLng()) <= 300)
        .map((m: any) => m.__sessionData)
        .filter(Boolean)
        .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const html = `
        <div style="min-width:240px">
          <div style="font-weight:700;margin-bottom:6px">Sessions à ~300 m</div>
          <ul style="margin:0;padding:0;list-style:none;max-height:220px;overflow:auto">
            ${items.map((s: any) => `
              <li style="padding:6px 0;border-bottom:1px solid #eee">
                <div style="font-weight:600">${s.title || "Session"}</div>
                <div style="font-size:12px;opacity:.8">${formatDate(s.date)} • ${s.distance_km} km • ${s.intensity}</div>
                <button data-id="${s.id}" class="btn-open" style="margin-top:4px;font-size:12px;padding:2px 8px;background:#22c55e;color:white;border:none;border-radius:4px;cursor:pointer">Voir la session</button>
              </li>`).join("")}
          </ul>
        </div>`;

      const popup = L.popup({ maxWidth: 320 })
        .setLatLng(center)
        .setContent(html)
        .openOn(map.current!);

      // Add click handlers for session buttons
      setTimeout(() => {
        const container = popup.getElement();
        container?.querySelectorAll('.btn-open').forEach((btn: any) => {
          btn.onclick = () => openSessionDetails(btn.getAttribute('data-id'));
        });
      }, 0);
    });

    // Handle map move/zoom events to reload sessions
    let reloadTimeout: NodeJS.Timeout;
    map.current.on('moveend zoomend', () => {
      clearTimeout(reloadTimeout);
      reloadTimeout = setTimeout(() => {
        // Update cluster radius on zoom change
        if (clusterGroup.current && map.current) {
          const zoom = map.current.getZoom();
          const lat = map.current.getCenter().lat;
          const newRadius = Math.round(metersToPixels(300, lat, zoom));
          clusterGroup.current.options.maxClusterRadius = () => newRadius;
        }
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
    
    // Automatically request geolocation when map is initialized
    if (!hasAskedGeolocation) {
      setHasAskedGeolocation(true);
      setTimeout(() => {
        requestLocation();
      }, 500); // Small delay to ensure map is fully rendered
    }
  }, [hasAskedGeolocation, requestLocation]);

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

  // Update session markers with clustering
  const updateSessionMarkers = useCallback(() => {
    if (!map.current || !clusterGroup.current) return;

    // Clear existing markers
    clusterGroup.current.clearLayers();

    // Add new markers for each session
    sessions.forEach(session => {
      const isPaid = isUserPaid(session.id);
      const isHost = isUserHost(session);
      const canSeeExact = isPaid || isHost;
      
      const { lat, lng } = getDisplayLatLng(session, canSeeExact);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      // Create green circle markers with white border for better visibility
      const markerStyle = canSeeExact 
        ? { radius: 6, color: "#ffffff", weight: 3, fillColor: GREEN, fillOpacity: 1.0 }
        : { radius: 5, color: "#ffffff", weight: 2, fillColor: GREEN, fillOpacity: 0.9 };
      
      const marker = L.circleMarker([lat, lng], markerStyle);

      // Attach session data to marker
      (marker as any).__sessionData = session;

      // Create popup content
      const enrolledCount = session.enrollments?.filter((e: any) => e.status === 'paid')?.length || 0;
      const hostProfile = session.host_profile || {};
      const enrolledParticipants = session.enrollments?.filter((e: any) => e.status === 'paid' && e.user_id !== session.host_id) || [];
      
      const popupContent = canSeeExact ? `
        <div style="min-width: 240px; max-width: 320px; padding: 12px;">
          <h3 style="margin: 0 0 12px 0; font-weight: bold; color: #2d3748; font-size: 14px;">${session.title}</h3>
          
          <!-- Exact Location -->
          <div style="margin: 8px 0; padding: 8px; background: #f0fdf4; border-radius: 6px; border-left: 3px solid #059669;">
            <p style="margin: 0; font-size: 12px; color: #166534; font-weight: 500;">📍 Lieu exact révélé</p>
            <p style="margin: 2px 0 0 0; font-size: 11px; color: #166534;">${session.area_hint || 'Coordonnées exactes disponibles'}</p>
          </div>
          
          <p style="margin: 4px 0; color: #4a5568; font-size: 12px;">🏃 ${session.distance_km} km • ${session.intensity}</p>
          <p style="margin: 4px 0; color: #4a5568; font-size: 12px;">📅 ${formatDate(session.date)}</p>
          
          <!-- Host Info -->
          <div style="margin: 8px 0; padding: 8px; background: #fef3c7; border-radius: 6px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              ${hostProfile.avatar_url ? 
                `<img src="${hostProfile.avatar_url}" style="width: 26px; height: 26px; border-radius: 50%; object-fit: cover;" alt="Host">` : 
                `<div style="width: 26px; height: 26px; border-radius: 50%; background: #e2e8f0; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #64748b; font-size: 11px;">👤</div>`
              }
              <div>
                <div style="font-weight: 600; color: #92400e; font-size: 11px;">
                  ${hostProfile.full_name || 'Hôte'}
                  ${hostProfile.age ? `, ${hostProfile.age} ans` : ''}
                </div>
                <div style="font-size: 9px; color: #92400e;">Organisateur</div>
              </div>
            </div>
          </div>
          
          <!-- Participants -->
          ${enrolledParticipants.length > 0 ? `
            <div style="margin: 8px 0;">
              <div style="font-weight: 600; color: #2d3748; font-size: 11px; margin-bottom: 4px;">👥 Participants (${enrolledParticipants.length}/${session.max_participants - 1})</div>
              <div style="max-height: 80px; overflow-y: auto;">
                ${enrolledParticipants.slice(0, 3).map((enrollment: any) => {
                  const profile = enrollment.profile || {};
                  return `
                    <div style="display: flex; align-items: center; gap: 6px; margin: 2px 0; padding: 2px; background: #f8fafc; border-radius: 3px;">
                      ${profile.avatar_url ? 
                        `<img src="${profile.avatar_url}" style="width: 18px; height: 18px; border-radius: 50%; object-fit: cover;" alt="Participant">` : 
                        `<div style="width: 18px; height: 18px; border-radius: 50%; background: #e2e8f0; display: flex; align-items: center; justify-content: center; font-size: 7px;">👤</div>`
                      }
                      <span style="font-size: 10px; color: #4a5568;">
                        ${profile.full_name || 'Participant'}
                        ${profile.age ? ` • ${profile.age} ans` : ''}
                      </span>
                    </div>
                  `;
                }).join('')}
                ${enrolledParticipants.length > 3 ? `<div style="font-size: 9px; color: #64748b; text-align: center; margin-top: 2px;">+${enrolledParticipants.length - 3} autres</div>` : ''}
              </div>
            </div>
          ` : `<p style="margin: 6px 0; color: #64748b; font-size: 11px;">👥 Aucun autre participant</p>`}
          
          <button 
            onclick="window.selectSession && window.selectSession('${session.id}')"
            style="margin-top: 10px; width: 100%; padding: 6px; background: #059669; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500; font-size: 11px;">
            Voir les détails complets
          </button>
        </div>
      ` : `
        <div style="min-width: 220px; max-width: 280px; padding: 12px;">
          <h3 style="margin: 0 0 12px 0; font-weight: bold; color: #2d3748; font-size: 14px;">${session.title}</h3>
          
          <!-- Host Info -->
          <div style="margin: 8px 0; padding: 8px; background: #f8fafc; border-radius: 6px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              ${hostProfile.avatar_url ? 
                `<img src="${hostProfile.avatar_url}" style="width: 30px; height: 30px; border-radius: 50%; object-fit: cover;" alt="Host">` : 
                `<div style="width: 30px; height: 30px; border-radius: 50%; background: #e2e8f0; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #64748b;">👤</div>`
              }
              <div>
                <div style="font-weight: 600; color: #2d3748; font-size: 12px;">
                  ${hostProfile.full_name || 'Hôte'}
                  ${hostProfile.age ? `, ${hostProfile.age} ans` : ''}
                </div>
                <div style="font-size: 10px; color: #64748b;">Organisateur</div>
              </div>
            </div>
          </div>
          
          <p style="margin: 6px 0; color: #4a5568; font-size: 12px;">📍 Zone approximative</p>
          <p style="margin: 4px 0; color: #4a5568; font-size: 12px;">🏃 ${session.distance_km} km • ${session.intensity}</p>
          <p style="margin: 4px 0; color: #4a5568; font-size: 12px;">📅 ${formatDate(session.date)}</p>
          <p style="margin: 6px 0; color: #4a5568; font-size: 12px;">👥 ${enrolledCount}/${session.max_participants} participants</p>
          
          <div style="margin-top: 12px; padding: 8px; background: #f0fdf4; border-radius: 4px; border-left: 3px solid #059669;">
            <p style="margin: 0; font-size: 11px; color: #166534; font-style: italic;">
              Inscrivez-vous pour voir le lieu exact et les autres participants
            </p>
          </div>
          <button 
            onclick="window.selectSession && window.selectSession('${session.id}')"
            style="margin-top: 10px; width: 100%; padding: 6px; background: #059669; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500; font-size: 11px;">
            S'inscrire - ${(session.price_cents / 100).toFixed(2)}$
          </button>
        </div>
      `;

      marker.bindPopup(popupContent);
      clusterGroup.current.addLayer(marker);
    });

    // Global function for session selection
    (window as any).selectSession = (sessionId: string) => {
      onSessionSelect?.(sessionId);
    };
  }, [sessions, isUserPaid, isUserHost, getDisplayLatLng, formatDate, onSessionSelect]);

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

  // Initialize map on mount and reset geolocation request
  useEffect(() => {
    // Reset geolocation state on each mount (page visit)
    setHasAskedGeolocation(false);
    setShowGeolocationBanner(false);
    setShowGeolocationModal(false);
    
    initializeMap();
    
    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
      clusterGroup.current = null;
    };
  }, []);

  // Fetch user enrollments when user changes
  useEffect(() => {
    fetchUserEnrollments();
  }, [fetchUserEnrollments]);

  // Handle geolocation state changes
  useEffect(() => {
    if (!hasInitialized) return;

    // Handle permission granted - center on user location
    if (permission === 'granted' && position) {
      updateUserMarker(position.latitude, position.longitude, position.accuracy);
      
      // Always center map on user location when position is available
      if (map.current) {
        map.current.setView([position.latitude, position.longitude], 14);
      }

      toast({
        title: "Position détectée",
        description: "Sessions près de vous",
        duration: 3000,
      });
    }

    // Handle permission denied - center on Wellington
    if (permission === 'denied') {
      if (map.current) {
        map.current.setView(WELLINGTON_COORDS, 12);
      }
      
      setShowGeolocationBanner(true);
      toast({
        title: "Impossible d'obtenir votre position",
        description: "Affichage par défaut : Wellington.",
        variant: "destructive",
        duration: 4000,
      });
    }
  }, [permission, position, hasInitialized, updateUserMarker, toast]);

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

      {/* Legend */}
      <div className="absolute top-4 left-4 z-[1000] bg-white/90 backdrop-blur-sm rounded-lg p-2 shadow-lg">
        <div className="flex items-center text-xs text-gray-600">
          <div className="w-3 h-3 rounded-full bg-green-500 mr-2"></div>
          <span>🟢 Points verts = sessions (approx avant inscription, exact après)</span>
        </div>
      </div>

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