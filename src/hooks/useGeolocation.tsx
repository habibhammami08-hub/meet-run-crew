import { useState, useEffect, useCallback } from 'react';

export interface GeolocationPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export type GeolocationPermission = 'prompt' | 'granted' | 'denied';

export interface UseGeolocationReturn {
  position: GeolocationPosition | null;
  permission: GeolocationPermission;
  isLoading: boolean;
  error: string | null;
  requestLocation: () => void;
  hasAsked: boolean;
}

// CORRECTION: Par défaut sur Paris au lieu de Wellington  
const DEFAULT_COORDS = {
  latitude: 48.8566, // Paris
  longitude: 2.3522,
  accuracy: 10000 // Précision faible pour indiquer que c'est une position par défaut
};

export const useGeolocation = (): UseGeolocationReturn => {
  const [position, setPosition] = useState<GeolocationPosition | null>(null);
  const [permission, setPermission] = useState<GeolocationPermission>('prompt');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasAsked, setHasAsked] = useState(false);
  const [watchId, setWatchId] = useState<number | null>(null);

  // CORRECTION: Check permission status avec gestion d'erreur
  const checkPermission = useCallback(async () => {
    if (!('permissions' in navigator)) {
      console.log('Permission API not supported');
      return;
    }
    
    try {
      const result = await navigator.permissions.query({ name: 'geolocation' });
      setPermission(result.state as GeolocationPermission);
      
      const handlePermissionChange = () => {
        setPermission(result.state as GeolocationPermission);
      };
      
      result.addEventListener('change', handlePermissionChange);
      
      // Cleanup function
      return () => {
        result.removeEventListener('change', handlePermissionChange);
      };
    } catch (err) {
      console.log('Permission API error:', err);
    }
  }, []);

  // CORRECTION: Fonction pour arrêter le watching
  const stopWatching = useCallback(() => {
    if (watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }
  }, [watchId]);

  // CORRECTION: Request geolocation avec options améliorées et validation
  const requestLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      const errorMsg = 'La géolocalisation n\'est pas supportée par ce navigateur';
      setError(errorMsg);
      setPosition(DEFAULT_COORDS);
      setPermission('denied');
      return;
    }

    // Arrêter le watching précédent s'il existe
    stopWatching();

    setIsLoading(true);
    setError(null);
    setHasAsked(true);

    const options: PositionOptions = {
      enableHighAccuracy: false, // CORRECTION: Plus conservateur pour la stabilité
      timeout: 15000, // 15 secondes
      maximumAge: 300000 // Cache 5 minutes
    };

    const handleSuccess = (pos: globalThis.GeolocationPosition) => {
      const newPosition = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy
      };
      
      // CORRECTION: Validation des coordonnées reçues
      if (!Number.isFinite(newPosition.latitude) || 
          !Number.isFinite(newPosition.longitude) ||
          Math.abs(newPosition.latitude) > 90 ||
          Math.abs(newPosition.longitude) > 180) {
        console.error('[geolocation] Coordonnées invalides:', newPosition);
        setError('Coordonnées invalides reçues');
        setPosition(DEFAULT_COORDS);
        setPermission('denied');
        setIsLoading(false);
        return;
      }
      
      console.log('[geolocation] Position obtenue:', newPosition);
      setPosition(newPosition);
      setPermission('granted');
      setIsLoading(false);
      setError(null);
    };

    const handleError = (err: GeolocationPositionError) => {
      let errorMessage = '';
      
      switch (err.code) {
        case err.PERMISSION_DENIED:
          errorMessage = 'Géolocalisation refusée par l\'utilisateur';
          setPermission('denied');
          break;
        case err.POSITION_UNAVAILABLE:
          errorMessage = 'Position indisponible';
          setPermission('denied');
          break;
        case err.TIMEOUT:
          errorMessage = 'Délai dépassé pour obtenir la position';
          // Ne pas changer la permission pour timeout
          break;
        default:
          errorMessage = 'Erreur de géolocalisation inconnue';
          setPermission('denied');
          break;
      }
      
      console.log('[geolocation] Erreur:', errorMessage, err);
      setError(errorMessage);
      setIsLoading(false);
      
      // CORRECTION: Utiliser la position par défaut en cas d'erreur
      setPosition(DEFAULT_COORDS);
    };

    // CORRECTION: Utiliser getCurrentPosition au lieu de watchPosition pour plus de stabilité
    navigator.geolocation.getCurrentPosition(handleSuccess, handleError, options);
  }, [stopWatching]);

  // CORRECTION: Initialisation et nettoyage
  useEffect(() => {
    checkPermission();
    
    // CORRECTION: Ne pas faire de request automatique au montage
    // L'utilisateur doit explicitement demander la géolocalisation
    
    return () => {
      stopWatching();
    };
  }, [checkPermission, stopWatching]);

  // CORRECTION: Nettoyer le watching quand le composant se démonte
  useEffect(() => {
    return () => {
      stopWatching();
    };
  }, [stopWatching]);

  return {
    position,
    permission,
    isLoading,
    error,
    requestLocation,
    hasAsked
  };
};