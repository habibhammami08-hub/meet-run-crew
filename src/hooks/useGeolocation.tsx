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

const WELLINGTON_COORDS = {
  latitude: -41.28664,
  longitude: 174.77557,
  accuracy: 1000
};

export const useGeolocation = (): UseGeolocationReturn => {
  const [position, setPosition] = useState<GeolocationPosition | null>(null);
  const [permission, setPermission] = useState<GeolocationPermission>('prompt');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasAsked, setHasAsked] = useState(false);

  // Check permission status
  const checkPermission = useCallback(async () => {
    if (!('permissions' in navigator)) return;
    
    try {
      const result = await navigator.permissions.query({ name: 'geolocation' });
      setPermission(result.state as GeolocationPermission);
      
      result.addEventListener('change', () => {
        setPermission(result.state as GeolocationPermission);
      });
    } catch (err) {
      console.log('Permission API not supported');
    }
  }, []);

  // Request geolocation
  const requestLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setError('La géolocalisation n\'est pas supportée par ce navigateur');
      setPosition(WELLINGTON_COORDS);
      return;
    }

    setIsLoading(true);
    setError(null);
    setHasAsked(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const newPosition = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        };
        
        setPosition(newPosition);
        setPermission('granted');
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        let errorMessage = '';
        
        switch (err.code) {
          case err.PERMISSION_DENIED:
            errorMessage = 'Géolocalisation refusée';
            setPermission('denied');
            break;
          case err.POSITION_UNAVAILABLE:
            errorMessage = 'Position indisponible';
            break;
          case err.TIMEOUT:
            errorMessage = 'Délai dépassé pour obtenir la position';
            break;
          default:
            errorMessage = 'Erreur de géolocalisation inconnue';
            break;
        }
        
        setError(errorMessage);
        setIsLoading(false);
        setPosition(WELLINGTON_COORDS); // Fallback to Wellington
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 60000
      }
    );
  }, []);

  useEffect(() => {
    checkPermission();
  }, [checkPermission]);

  return {
    position,
    permission,
    isLoading,
    error,
    requestLocation,
    hasAsked
  };
};