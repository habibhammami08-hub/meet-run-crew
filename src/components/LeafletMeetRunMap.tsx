import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

// Import required leaflet dependencies and styles
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";

// Constants
const WELLINGTON_COORDS: [number, number] = [-41.28664, 174.77557];
const GREEN = "#059669"; // Tailwind green-600

interface Session {
  id: string;
  title: string;
  date: string;
  location_lat: number;
  location_lng: number;
  distance_km: number;
  intensity: string;
  price_cents: number;
  host_id: string;
  max_participants: number;
  blur_radius_m?: number;
  area_hint?: string;
  enrollments?: any[];
  host_profile?: {
    id: string;
    full_name?: string;
    age?: number;
    avatar_url?: string;
  };
}

interface LeafletMeetRunMapProps {
  sessions: Session[];
  selectedSession?: Session | null;
  isLoading?: boolean;
  onSessionSelect?: (sessionId: string) => void;
  enableGeolocation?: boolean;
  showGeolocationBanner?: boolean;
  onLocationFound?: (lat: number, lng: number, accuracy: number) => void;
  onLocationError?: (error: string) => void;
  className?: string;
}

const LeafletMeetRunMap = ({
  sessions = [],
  selectedSession,
  isLoading = false,
  onSessionSelect,
  enableGeolocation = true,
  showGeolocationBanner = true,
  onLocationFound,
  onLocationError,
}: LeafletMeetRunMapProps) => {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const clusterGroup = useRef<any>(null);
  const userMarker = useRef<L.Circle | null>(null);
  const sessionMarkers = useRef<L.CircleMarker[]>([]);

  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [hasAskedGeolocation, setHasAskedGeolocation] = useState(false);

  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Navigate to session helper
  const navigateToSession = useCallback((sessionId: string) => {
    navigate(`/session/${sessionId}`);
  }, [navigate]);

  // Convert meters to pixels for cluster radius calculation
  const metersToPixels = useCallback((meters: number, lat: number, zoom: number) => {
    const metersPerPixel = 40075016.686 * Math.abs(Math.cos(lat * Math.PI / 180)) / Math.pow(2, zoom + 8);
    return meters / metersPerPixel;
  }, []);

  // Create cluster icon
  const createClusterIcon = useCallback((cluster: any) => {
    const childCount = cluster.getChildCount();
    const size = childCount < 10 ? 'small' : childCount < 100 ? 'medium' : 'large';
    const sizeClass = size === 'small' ? 30 : size === 'medium' ? 40 : 50;
    
    return L.divIcon({
      html: `<div style="
        width: ${sizeClass}px; 
        height: ${sizeClass}px; 
        background: ${GREEN}; 
        border-radius: 50%; 
        border: 3px solid white;
        display: flex; 
        align-items: center; 
        justify-content: center; 
        color: white; 
        font-weight: bold;
        font-size: ${size === 'small' ? '12' : size === 'medium' ? '14' : '16'}px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      ">${childCount}</div>`,
      className: 'custom-cluster-icon',
      iconSize: [sizeClass, sizeClass],
    });
  }, []);

  // Check if user is paid for session
  const isUserPaid = useCallback((sessionId: string) => {
    if (!user) return false;
    const session = sessions.find(s => s.id === sessionId);
    return session?.enrollments?.some(e => e.user_id === user.id && e.status === 'paid') || false;
  }, [user, sessions]);

  // Check if user is host
  const isUserHost = useCallback((session: Session) => {
    return user && session.host_id === user.id;
  }, [user]);

  // Get display coordinates (blurred for non-paid users)
  const getDisplayLatLng = useCallback((session: Session, canSeeExact: boolean) => {
    if (canSeeExact) {
      return { lat: session.location_lat, lng: session.location_lng };
    }
    
    // Generate consistent blur based on session ID
    const hash = session.id.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    
    const blurKm = 1; // 1km blur radius
    const latOffset = (Math.sin(hash) * blurKm) / 111;
    const lngOffset = (Math.cos(hash) * blurKm) / (111 * Math.cos(session.location_lat * Math.PI / 180));
    
    return {
      lat: session.location_lat + latOffset,
      lng: session.location_lng + lngOffset,
    };
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

  // Request user location
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      onLocationError?.("Géolocalisation non supportée");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        setUserLocation({ lat: latitude, lng: longitude });
        onLocationFound?.(latitude, longitude, accuracy);
        
        if (map.current) {
          map.current.setView([latitude, longitude], 13);
        }
      },
      (error) => {
        onLocationError?.(error.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000 // 5 minutes
      }
    );
  }, [onLocationFound, onLocationError]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = L.map(mapContainer.current, {
      center: WELLINGTON_COORDS,
      zoom: 12,
      zoomControl: true
    });

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

    // Handle cluster clicks with reliable popup binding
    clusterGroup.current.on("clusterclick", (e: any) => {
      const center = e.layer.getLatLng();
      const children = e.layer.getAllChildMarkers();
      const sessionsData = children.map((m: any) => m.__sessionData).filter(Boolean);

      const html = `
        <div class="cluster-popup" style="min-width:240px">
          <div style="font-weight:700;margin-bottom:6px">${sessionsData.length} sessions à proximité</div>
          <ul style="margin:0;padding:0;list-style:none;max-height:220px;overflow:auto">
            ${sessionsData.map((session: any) => `
              <li style="padding:6px 0;border-bottom:1px solid #eee">
                <div style="font-weight:600">${session.title || "Session"}</div>
                <div style="font-size:12px;opacity:.8">${formatDate(session.date)} • ${session.distance_km} km • ${session.intensity}</div>
                <button data-id="${session.id}" class="btn-open-session" style="margin-top:6px;font-size:12px;padding:4px 8px;background:#059669;color:white;border:none;border-radius:4px;cursor:pointer;">Voir la session</button>
              </li>`).join("")}
          </ul>
        </div>`;

      const popup = L.popup({ maxWidth: 320 }).setLatLng(center).setContent(html);
      popup.addTo(map.current!);
    });

    // Handle popup clicks for navigation
    map.current.on("popupopen", (evt: any) => {
      const popupElement = evt.popup.getElement();
      if (!popupElement) return;
      
      popupElement.querySelectorAll(".btn-open-session").forEach((btn: Element) => {
        (btn as HTMLButtonElement).onclick = (event) => {
          event.preventDefault();
          event.stopPropagation();
          const sessionId = (btn as HTMLElement).getAttribute("data-id");
          if (sessionId) {
            navigateToSession(sessionId);
          }
        };
      });
    });

    setHasInitialized(true);
    
    // Automatically request geolocation when map is initialized
    if (enableGeolocation && !hasAskedGeolocation) {
      setHasAskedGeolocation(true);
      setTimeout(() => {
        requestLocation();
      }, 500);
    }
  }, [enableGeolocation, hasAskedGeolocation, requestLocation, createClusterIcon, metersToPixels, formatDate, navigateToSession]);

  // Update user marker
  const updateUserMarker = useCallback((lat: number, lng: number, accuracy: number) => {
    if (!map.current) return;

    // Remove existing user marker
    if (userMarker.current) {
      map.current.removeLayer(userMarker.current);
    }

    // Create new user marker with accuracy circle
    userMarker.current = L.circle([lat, lng], {
      radius: accuracy,
      color: '#4285f4',
      fillColor: '#4285f4',
      fillOpacity: 0.2,
      weight: 2
    }).addTo(map.current);

    // Add center dot
    L.circleMarker([lat, lng], {
      radius: 6,
      color: '#ffffff',
      weight: 2,
      fillColor: '#4285f4',
      fillOpacity: 1
    }).addTo(map.current);

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

      // Attach complete session data to marker
      (marker as any).__sessionData = {
        id: session.id,
        title: session.title,
        date: session.date,
        distance_km: session.distance_km,
        intensity: session.intensity,
        price_cents: session.price_cents,
        host_profile: session.host_profile
      };

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
              ${(hostProfile as any)?.avatar_url ? 
                `<img src="${(hostProfile as any).avatar_url}" style="width: 26px; height: 26px; border-radius: 50%; object-fit: cover;" alt="Host">` : 
                `<div style="width: 26px; height: 26px; border-radius: 50%; background: #e2e8f0; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #64748b; font-size: 11px;">👤</div>`
              }
              <div>
                <div style="font-weight: 600; color: #92400e; font-size: 11px;">
                  ${(hostProfile as any)?.full_name || 'Organisateur'}${(hostProfile as any)?.age ? `, ${(hostProfile as any).age} ans` : ''}
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
                ${enrolledParticipants.length > 3 ? `<div style="font-size: 9px; color: #64748b; margin-top: 4px;">+${enrolledParticipants.length - 3} autres</div>` : ''}
              </div>
            </div>
          ` : ''}
          
          <div style="margin: 8px 0; padding: 6px; background: #f7fafc; border-radius: 4px; text-align: center;">
            <span style="font-size: 11px; color: #4a5568;">👥 ${enrolledCount + 1}/${session.max_participants} participants</span>
          </div>
        </div>
      ` : `
        <div style="min-width: 240px; max-width: 300px; padding: 12px;">
          <h3 style="margin: 0 0 8px 0; font-weight: bold; color: #2d3748; font-size: 14px;">${session.title}</h3>
          
          <!-- Approximate Location Warning -->
          <div style="margin: 8px 0; padding: 8px; background: #fef3c7; border-radius: 6px; border-left: 3px solid #f59e0b;">
            <p style="margin: 0; font-size: 12px; color: #92400e; font-weight: 500;">📍 Zone approximative (${session.blur_radius_m || 1000}m)</p>
            <p style="margin: 2px 0 0 0; font-size: 11px; color: #92400e;">Inscrivez-vous pour voir le lieu exact</p>
          </div>
          
          <p style="margin: 4px 0; color: #4a5568; font-size: 12px;">🏃 ${session.distance_km} km • ${session.intensity}</p>
          <p style="margin: 4px 0; color: #4a5568; font-size: 12px;">📅 ${formatDate(session.date)}</p>
          <p style="margin: 4px 0; color: #4a5568; font-size: 12px;">💰 ${(session.price_cents / 100).toFixed(2)}€</p>
          
          <!-- Host Info -->
          <div style="margin: 8px 0; padding: 8px; background: #fef3c7; border-radius: 6px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              ${(hostProfile as any)?.avatar_url ? 
                `<img src="${(hostProfile as any).avatar_url}" style="width: 26px; height: 26px; border-radius: 50%; object-fit: cover;" alt="Host">` : 
                `<div style="width: 26px; height: 26px; border-radius: 50%; background: #e2e8f0; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #64748b; font-size: 11px;">👤</div>`
              }
              <div>
                <div style="font-weight: 600; color: #92400e; font-size: 11px;">
                  ${(hostProfile as any)?.full_name || 'Organisateur'}${(hostProfile as any)?.age ? `, ${(hostProfile as any).age} ans` : ''}
                </div>
                <div style="font-size: 9px; color: #92400e;">Organisateur</div>
              </div>
            </div>
          </div>
          
          <div style="margin: 8px 0; padding: 6px; background: #f7fafc; border-radius: 4px; text-align: center;">
            <span style="font-size: 11px; color: #4a5568;">👥 ${enrolledCount + 1}/${session.max_participants} participants</span>
          </div>
        </div>
      `;

      marker.bindPopup(popupContent, { maxWidth: 340 });

      // Add click handler for all markers to navigate to session
      marker.on('click', (e) => {
        // Prevent default popup if we want direct navigation
        if (!canSeeExact) {
          e.originalEvent?.stopPropagation();
          navigateToSession(session.id);
        }
      });

      clusterGroup.current.addLayer(marker);
    });
  }, [sessions, isUserPaid, isUserHost, getDisplayLatLng, formatDate, navigateToSession]);

  // Update markers when sessions change
  useEffect(() => {
    if (hasInitialized && sessions.length > 0) {
      updateSessionMarkers();
    }
  }, [hasInitialized, sessions, updateSessionMarkers]);

  // Update user location marker
  useEffect(() => {
    if (userLocation && hasInitialized) {
      updateUserMarker(userLocation.lat, userLocation.lng, 100);
    }
  }, [userLocation, hasInitialized, updateUserMarker]);

  return (
    <div className="w-full h-full relative">
      <div
        ref={mapContainer}
        className="w-full h-full rounded-lg overflow-hidden"
        style={{ minHeight: '400px' }}
      />
      {isLoading && (
        <div className="absolute inset-0 bg-black/10 flex items-center justify-center">
          <div className="bg-white rounded-lg p-4 shadow-lg">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeafletMeetRunMap;