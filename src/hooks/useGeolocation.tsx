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

  // CORRECTION: Request geolocation automatiquement au démarrage
  const requestLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setError('La géolocalisation n\'est pas supportée par ce navigateur');
      setPosition(DEFAULT_COORDS);
      setPermission('denied');
      return;
    }

    setIsLoading(true);
    setError(null);
    setHasAsked(true);

    const options = {
      enableHighAccuracy: true,
      timeout: 15000, // Timeout plus long
      maximumAge: 300000 // Cache 5 minutes
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const newPosition = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        };
        
        console.log('[geolocation] Position obtenue:', newPosition);
        setPosition(newPosition);
        setPermission('granted');
        setIsLoading(false);
        setError(null);
      },
      (err) => {
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
            setPermission('denied');
            break;
          default:
            errorMessage = 'Erreur de géolocalisation inconnue';
            setPermission('denied');
            break;
        }
        
        console.log('[geolocation] Erreur:', errorMessage);
        setError(errorMessage);
        setIsLoading(false);
        
        // CORRECTION: Utiliser la position par défaut en cas d'erreur
        setPosition(DEFAULT_COORDS);
      },
      options
    );
  }, []);

  // FIXE: Supprimer l'auto-request pour éviter les boucles infinites
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