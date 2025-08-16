// src/components/LeafletMeetRunMap.tsx - Version corrigée et stabilisée

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

// Import required leaflet dependencies and styles
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";

// Constants
const PARIS_COORDS: [number, number] = [48.8566, 2.3522];
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
  className = "",
}: LeafletMeetRunMapProps) => {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const clusterGroup = useRef<any>(null);
  const userMarker = useRef<L.Circle | null>(null);
  const sessionMarkers = useRef<L.CircleMarker[]>([]);

  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [hasInitialized, setHasInitialized] = useState(false);

  const { user, hasActiveSubscription } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const supabase = getSupabase();

  // Guard browser-only operations
  if (typeof window === 'undefined') return null;

  // Coordinate jitter function for non-subscribers
  const jitter = (lat: number, lng: number, meters = 800) => {
    const r = meters / 111320; // ~ meters -> degrees
    const u = Math.random();
    const v = Math.random();
    const w = r * Math.sqrt(u);
    const t = 2 * Math.PI * v;
    return [lat + w * Math.cos(t), lng + w * Math.sin(t)] as const;
  };

  // Validation stricte et sécurisée des sessions
  const validSessions = sessions.filter(session => {
    if (!session || typeof session !== 'object') return false;
    
    const lat = Number(session.location_lat);
    const lng = Number(session.location_lng);
    
    const isValidLat = Number.isFinite(lat) && lat >= -90 && lat <= 90;
    const isValidLng = Number.isFinite(lng) && lng >= -180 && lng <= 180;
    
    if (!isValidLat || !isValidLng) {
      console.warn(`Session ${session.id} - coordonnées invalides:`, { lat, lng });
      return false;
    }
    
    return true;
  });

  // Navigate to session helper avec gestion d'erreur
  const navigateToSession = useCallback((sessionId: string) => {
    try {
      if (!sessionId || typeof sessionId !== 'string') {
        console.error("Session ID invalide:", sessionId);
        return;
      }
      console.log("[LeafletMap] Navigation vers session:", sessionId);
      navigate(`/session/${sessionId}`);
    } catch (error) {
      console.error("[LeafletMap] Erreur navigation:", error);
      toast({
        title: "Erreur de navigation",
        description: "Impossible d'ouvrir la session",
        variant: "destructive",
      });
    }
  }, [navigate, toast]);

  // Convert meters to pixels pour cluster radius
  const metersToPixels = useCallback((meters: number, lat: number, zoom: number) => {
    const metersPerPixel = 40075016.686 * Math.abs(Math.cos(lat * Math.PI / 180)) / Math.pow(2, zoom + 8);
    return Math.max(20, meters / metersPerPixel); // Minimum 20 pixels
  }, []);

  // Create cluster icon avec validation
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

  // Check if user is paid for session avec validation
  const isUserPaid = useCallback((sessionId: string) => {
    if (!user || !sessionId) return false;
    const session = validSessions.find(s => s.id === sessionId);
    if (!session || !Array.isArray(session.enrollments)) return false;
    return session.enrollments.some(e => 
      e && e.user_id === user.id && ['paid', 'included_by_subscription'].includes(e.status)
    );
  }, [user, validSessions]);

  // Check if user is host avec validation
  const isUserHost = useCallback((session: Session) => {
    return user && session && session.host_id === user.id;
  }, [user]);

  // Get display coordinates with jitter for non-subscribers
  const getDisplayLatLng = useCallback((session: Session, canSeeExact: boolean) => {
    if (!session) return { lat: PARIS_COORDS[0], lng: PARIS_COORDS[1] };
    
    if (canSeeExact) {
      return { lat: session.location_lat, lng: session.location_lng };
    }
    
    // For non-subscribers, apply jitter/blur to coordinates
    if (!hasActiveSubscription) {
      // Generate consistent blur based on session ID for reproducible results
      let hash = 0;
      if (session.id && typeof session.id === 'string') {
        for (let i = 0; i < session.id.length; i++) {
          const char = session.id.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash; // Convert to 32bit integer
        }
      }
      
      // Use hash to create deterministic but obscured coordinates
      const blurKm = 0.8; // 800m blur radius
      const latOffset = (Math.sin(hash) * blurKm) / 111;
      const lngOffset = (Math.cos(hash) * blurKm) / (111 * Math.cos(session.location_lat * Math.PI / 180));
      
      return {
        lat: session.location_lat + latOffset,
        lng: session.location_lng + lngOffset,
      };
    }
    
    // Fallback for edge cases
    return { lat: session.location_lat, lng: session.location_lng };
  }, [hasActiveSubscription]);

  // Format date avec gestion d'erreur
  const formatDate = useCallback((dateStr: string) => {
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        return "Date invalide";
      }
      return date.toLocaleDateString('fr-FR', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      console.error("Erreur formatage date:", error);
      return "Date invalide";
    }
  }, []);

  // Request user location avec gestion d'erreur améliorée
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      onLocationError?.("Géolocalisation non supportée");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          onLocationError?.("Coordonnées invalides reçues");
          return;
        }
        
        console.log("[LeafletMap] Géolocalisation réussie:", { latitude, longitude, accuracy });
        setUserLocation({ lat: latitude, lng: longitude });
        onLocationFound?.(latitude, longitude, accuracy);
        
        if (map.current) {
          map.current.setView([latitude, longitude], 13);
        }
      },
      (error) => {
        console.error("[LeafletMap] Erreur géolocalisation:", error);
        const errorMessage = error.code === 1 ? "Permission refusée" :
                           error.code === 2 ? "Position indisponible" :
                           error.code === 3 ? "Délai dépassé" : "Erreur inconnue";
        onLocationError?.(errorMessage);
      },
      {
        enableHighAccuracy: false, // CORRECTION: Plus conservateur pour la stabilité
        timeout: 10000,
        maximumAge: 300000 // 5 minutes
      }
    );
  }, [onLocationFound, onLocationError]);

  // Initialize map with proper cleanup and error handling
  useEffect(() => {
    // Guard browser-only operations
    if (typeof window === 'undefined') return;
    
    if (!mapContainer.current || map.current) {
      return;
    }

    console.log("[LeafletMap] Initialisation de la carte...");

    try {
      map.current = L.map(mapContainer.current, {
        center: PARIS_COORDS,
        zoom: 12,
        zoomControl: true,
        attributionControl: true
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
        errorTileUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="%23f0f0f0"/></svg>'
      }).addTo(map.current);

      // Initialize cluster group with improved options
      clusterGroup.current = (L as any).markerClusterGroup({
        spiderfyOnMaxZoom: false,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: false,
        iconCreateFunction: createClusterIcon,
        maxClusterRadius: (zoom: number) => {
          const lat = map.current?.getCenter().lat || 48.8566;
          return Math.round(metersToPixels(300, lat, zoom));
        },
        disableClusteringAtZoom: 18
      });
      
      map.current.addLayer(clusterGroup.current);

      // Handle cluster clicks with validation
      clusterGroup.current.on("clusterclick", (e: any) => {
        try {
          const center = e.layer.getLatLng();
          const children = e.layer.getAllChildMarkers();
          const sessionsData = children.map((m: any) => m.__sessionData).filter(Boolean);

          if (sessionsData.length === 0) return;

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
        } catch (error) {
          console.error("Erreur cluster click:", error);
        }
      });

      // Handle popup clicks for navigation
      map.current.on("popupopen", (evt: any) => {
        try {
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
        } catch (error) {
          console.error("Erreur popup open:", error);
        }
      });

      setHasInitialized(true);
      console.log("[LeafletMap] Carte initialisée avec succès");
      
    } catch (error) {
      console.error("[LeafletMap] Erreur lors de l'initialisation:", error);
      toast({
        title: "Erreur de carte",
        description: "Impossible d'initialiser la carte",
        variant: "destructive",
      });
    }

    // Cleanup function with proper map removal
    return () => {
      if (map.current) {
        try {
          map.current.remove();
          map.current = null;
          clusterGroup.current = null;
          userMarker.current = null;
          sessionMarkers.current = [];
          setHasInitialized(false);
        } catch (error) {
          console.error("Erreur cleanup carte:", error);
        }
      }
    };
  }, [createClusterIcon, metersToPixels, formatDate, navigateToSession, toast]);

  // Set up realtime listener avec gestion d'erreur
  useEffect(() => {
    if (!hasInitialized) return;

    const channel = supabase
      .channel(`sessions-realtime-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessions' },
        (payload) => {
          console.log('[LeafletMap] Realtime update:', payload);
          // Note: Les sessions sont gérées par le composant parent
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('Erreur channel realtime');
        }
      });

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch (error) {
        console.error("Erreur suppression channel:", error);
      }
    };
  }, [hasInitialized]);

  // Update user marker avec validation
  const updateUserMarker = useCallback((lat: number, lng: number, accuracy: number) => {
    if (!map.current || !Number.isFinite(lat) || !Number.isFinite(lng)) return;

    try {
      // Remove existing user marker
      if (userMarker.current) {
        map.current.removeLayer(userMarker.current);
      }

      // Create new user marker with accuracy circle
      userMarker.current = L.circle([lat, lng], {
        radius: Math.min(accuracy, 1000), // Limiter à 1km max
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

      // Add popup
      userMarker.current.bindPopup("Votre position");

      // Show accuracy warning if precision is low
      if (accuracy > 1000) {
        toast({
          title: "Position approximative",
          description: `Précision: ${Math.round(accuracy)}m`,
          duration: 3000,
        });
      }
    } catch (error) {
      console.error("Erreur mise à jour marqueur utilisateur:", error);
    }
  }, [toast]);

  // Update session markers avec validation complète
  const updateSessionMarkers = useCallback(() => {
    if (!map.current || !clusterGroup.current) {
      return;
    }

    console.log("[LeafletMap] Mise à jour des marqueurs pour", validSessions.length, "sessions");

    try {
      // Clear existing markers
      clusterGroup.current.clearLayers();

      let validMarkersCount = 0;

      validSessions.forEach((session) => {
        try {
          const isPaid = isUserPaid(session.id);
          const isHost = isUserHost(session);
          const canSeeExact = isPaid || isHost;
          
          const { lat: displayLat, lng: displayLng } = getDisplayLatLng(session, canSeeExact);

          // Validation finale des coordonnées d'affichage
          if (!Number.isFinite(displayLat) || !Number.isFinite(displayLng)) {
            console.warn(`Coordonnées d'affichage invalides pour session ${session.id}`);
            return;
          }

          // Create marker style
          const markerStyle = canSeeExact 
            ? { radius: 8, color: "#ffffff", weight: 3, fillColor: GREEN, fillOpacity: 1.0 }
            : { radius: 6, color: "#ffffff", weight: 2, fillColor: GREEN, fillOpacity: 0.9 };
          
          const marker = L.circleMarker([displayLat, displayLng], markerStyle);

          // Attach session data to marker avec validation
          (marker as any).__sessionData = {
            id: session.id,
            title: session.title || 'Session sans titre',
            date: session.date,
            distance_km: session.distance_km || 0,
            intensity: session.intensity || 'medium',
            price_cents: session.price_cents || 0,
            host_profile: session.host_profile || {}
          };

          // Create popup content avec gestion des données manquantes
          const enrolledCount = Array.isArray(session.enrollments) 
            ? session.enrollments.filter((e: any) => e && ['paid', 'included_by_subscription'].includes(e.status)).length 
            : 0;
          const hostProfile = session.host_profile as { 
            id?: string; 
            full_name?: string; 
            age?: number; 
            avatar_url?: string; 
          } || {};
          
          const popupContent = canSeeExact ? `
            <div style="min-width: 240px; max-width: 320px; padding: 12px;">
              <h3 style="margin: 0 0 12px 0; font-weight: bold; color: #2d3748; font-size: 14px;">${session.title || 'Session'}</h3>
              
              <div style="margin: 8px 0; padding: 8px; background: #f0fdf4; border-radius: 6px; border-left: 3px solid #059669;">
                <p style="margin: 0; font-size: 12px; color: #166534; font-weight: 500;">📍 Lieu exact révélé</p>
                <p style="margin: 2px 0 0 0; font-size: 11px; color: #166534;">${session.area_hint || 'Coordonnées exactes disponibles'}</p>
              </div>
              
              <p style="margin: 4px 0; color: #4a5568; font-size: 12px;">🏃 ${session.distance_km || 0} km • ${session.intensity || 'N/A'}</p>
              <p style="margin: 4px 0; color: #4a5568; font-size: 12px;">📅 ${formatDate(session.date)}</p>
              
              <div style="margin: 8px 0; padding: 8px; background: #fef3c7; border-radius: 6px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  ${hostProfile?.avatar_url ? 
                    `<img src="${hostProfile.avatar_url}" style="width: 26px; height: 26px; border-radius: 50%; object-fit: cover;" alt="Host">` : 
                    `<div style="width: 26px; height: 26px; border-radius: 50%; background: #e2e8f0; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #64748b; font-size: 11px;">👤</div>`
                  }
                  <div>
                    <div style="font-weight: 600; color: #92400e; font-size: 11px;">
                      ${hostProfile?.full_name || 'Organisateur'}${hostProfile?.age ? `, ${hostProfile.age} ans` : ''}
                    </div>
                    <div style="font-size: 9px; color: #92400e;">Organisateur</div>
                  </div>
                </div>
              </div>
              
              <div style="margin: 8px 0; padding: 6px; background: #f7fafc; border-radius: 4px; text-align: center;">
                <span style="font-size: 11px; color: #4a5568;">👥 ${enrolledCount + 1}/${session.max_participants || 0} participants</span>
              </div>
            </div>
          ` : `
            <div style="min-width: 240px; max-width: 300px; padding: 12px;">
              <h3 style="margin: 0 0 8px 0; font-weight: bold; color: #2d3748; font-size: 14px;">${session.title || 'Session'}</h3>
              
              <div style="margin: 8px 0; padding: 8px; background: #fef3c7; border-radius: 6px; border-left: 3px solid #f59e0b;">
                <p style="margin: 0; font-size: 12px; color: #92400e; font-weight: 500;">📍 Zone approximative (${session.blur_radius_m || 1000}m)</p>
                <p style="margin: 2px 0 0 0; font-size: 11px; color: #92400e;">Inscrivez-vous pour voir le lieu exact</p>
              </div>
              
              <p style="margin: 4px 0; color: #4a5568; font-size: 12px;">🏃 ${session.distance_km || 0} km • ${session.intensity || 'N/A'}</p>
              <p style="margin: 4px 0; color: #4a5568; font-size: 12px;">📅 ${formatDate(session.date)}</p>
              <p style="margin: 4px 0; color: #4a5568; font-size: 12px;">💰 ${((session.price_cents || 0) / 100).toFixed(2)}€</p>
              
              <div style="margin: 8px 0; padding: 6px; background: #f7fafc; border-radius: 4px; text-align: center;">
                <span style="font-size: 11px; color: #4a5568;">👥 ${enrolledCount + 1}/${session.max_participants || 0} participants</span>
              </div>
            </div>
          `;

          marker.bindPopup(popupContent, { maxWidth: 340 });

          // Add click handler for navigation
          marker.on('click', (e) => {
            if (!canSeeExact) {
              e.originalEvent?.stopPropagation();
              navigateToSession(session.id);
            }
          });

          clusterGroup.current.addLayer(marker);
          validMarkersCount++;
        } catch (error) {
          console.error(`Erreur création marqueur pour session ${session.id}:`, error);
        }
      });

      console.log(`[LeafletMap] ${validMarkersCount} marqueurs ajoutés avec succès`);
    } catch (error) {
      console.error("Erreur mise à jour marqueurs sessions:", error);
    }
  }, [validSessions, isUserPaid, isUserHost, getDisplayLatLng, formatDate, navigateToSession]);

  // Update markers when sessions change
  useEffect(() => {
    if (hasInitialized && validSessions.length >= 0) {
      updateSessionMarkers();
    }
  }, [hasInitialized, validSessions, updateSessionMarkers]);

  // Update user location marker
  useEffect(() => {
    if (userLocation && hasInitialized) {
      updateUserMarker(userLocation.lat, userLocation.lng, 100);
    }
  }, [userLocation, hasInitialized, updateUserMarker]);

  return (
    <div className={`w-full h-full relative ${className}`}>
      <div
        ref={mapContainer}
        className="w-full h-full rounded-lg overflow-hidden"
        style={{ minHeight: '400px', backgroundColor: '#f8f9fa' }}
      />
      {isLoading && (
        <div className="absolute inset-0 bg-black/10 flex items-center justify-center">
          <div className="bg-white rounded-lg p-4 shadow-lg">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
            <div className="text-sm text-center">Chargement de la carte...</div>
          </div>
        </div>
      )}
      {/* Debug info en développement */}
      {import.meta.env.MODE === 'development' && (
        <div className="absolute top-2 left-2 bg-black/80 text-white text-xs p-2 rounded max-w-xs">
          <div>Sessions: {validSessions.length}/{sessions.length}</div>
          <div>Carte: {hasInitialized ? '✅' : '❌'}</div>
          <div>Container: {mapContainer.current ? '✅' : '❌'}</div>
          <div>Map: {map.current ? '✅' : '❌'}</div>
          <div>Cluster: {clusterGroup.current ? '✅' : '❌'}</div>
        </div>
      )}
    </div>
  );
};

export default LeafletMeetRunMap;