import { useState, useEffect, useCallback } from 'react';
import { toast } from '@/hooks/use-toast';

interface GeolocationNotificationState {
  permissionStatus: NotificationPermission | null;
  hasShownLocationPrompt: boolean;
  locationError: GeolocationPositionError | null;
}

interface UseGeolocationNotificationsReturn {
  requestNotificationPermission: () => Promise<void>;
  showLocationSettingsNotification: () => void;
  handleGeolocationError: (error: GeolocationPositionError) => void;
  permissionStatus: NotificationPermission | null;
}

export function useGeolocationNotifications(): UseGeolocationNotificationsReturn {
  const [state, setState] = useState<GeolocationNotificationState>({
    permissionStatus: typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : null,
    hasShownLocationPrompt: false,
    locationError: null,
  });

  // Détecter le navigateur et la plateforme
  const getBrowserInfo = useCallback(() => {
    const userAgent = navigator.userAgent;
    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    const isIOS = /iPad|iPhone|iPod/.test(userAgent);
    const isAndroid = /Android/.test(userAgent);
    const isSafari = /Safari/.test(userAgent) && !/Chrome/.test(userAgent);
    const isChrome = /Chrome/.test(userAgent);
    const isFirefox = /Firefox/.test(userAgent);

    return { isMobile, isIOS, isAndroid, isSafari, isChrome, isFirefox };
  }, []);

  // Demander la permission pour les notifications
  const requestNotificationPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      console.warn('Ce navigateur ne supporte pas les notifications');
      return;
    }

    if (Notification.permission === 'granted') {
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setState(prev => ({ ...prev, permissionStatus: permission }));
      
      if (permission === 'granted') {
        toast({
          title: "Notifications activées",
          description: "Nous pourrons vous rappeler d'activer votre géolocalisation si nécessaire.",
        });
      }
    } catch (error) {
      console.error('Erreur lors de la demande de permission pour les notifications:', error);
    }
  }, []);

  // Afficher une notification pour les réglages de localisation
  const showLocationSettingsNotification = useCallback(() => {
    if (state.permissionStatus === 'granted') {
      new Notification('Géolocalisation désactivée', {
        body: 'Activez votre localisation dans les réglages de votre navigateur pour voir les sessions près de chez vous.',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'geolocation-settings',
        requireInteraction: true,
      });
    }
  }, [state.permissionStatus]);

  // Gérer les erreurs de géolocalisation avec des messages contextuels
  const handleGeolocationError = useCallback((error: GeolocationPositionError) => {
    const { isMobile, isIOS, isAndroid, isSafari, isChrome, isFirefox } = getBrowserInfo();
    
    setState(prev => ({ ...prev, locationError: error }));

    let title = "Géolocalisation indisponible";
    let description = "";
    let actionText = "";

    switch (error.code) {
      case GeolocationPositionError.PERMISSION_DENIED:
        title = "Géolocalisation refusée";
        
        if (isMobile) {
          // Message simplifié pour mobile
          description = "Activez la géolocalisation dans vos réglages pour voir les sessions près de chez vous.";
          actionText = "Réessayer";
        } else {
          // Version desktop
          if (isChrome) {
            description = "Cliquez sur l'icône de cadenas dans la barre d'adresse et autorisez la localisation.";
            actionText = "Instructions Chrome";
          } else if (isFirefox) {
            description = "Cliquez sur l'icône de bouclier et autorisez la localisation.";
            actionText = "Instructions Firefox";
          } else if (isSafari) {
            description = "Allez dans Safari > Préférences > Sites web > Localisation.";
            actionText = "Instructions Safari";
          }
        }
        break;
        
      case GeolocationPositionError.POSITION_UNAVAILABLE:
        title = "Position indisponible";
        description = "Votre position ne peut pas être déterminée. Vérifiez que les services de localisation sont activés sur votre appareil.";
        if (isMobile) {
          actionText = isIOS ? "Réglages iOS" : "Réglages Android";
        }
        break;
        
      case GeolocationPositionError.TIMEOUT:
        title = "Délai d'attente dépassé";
        description = "La géolocalisation prend trop de temps. Vérifiez votre connexion et les paramètres de localisation.";
        actionText = "Réessayer";
        break;
    }

    // Afficher le toast avec les instructions
    toast({
      title,
      description,
      duration: 8000,
      action: actionText ? (
        <button 
          onClick={() => {
            if (actionText.includes("Réessayer")) {
              // Déclencher une nouvelle tentative de géolocalisation
              window.location.reload();
            } else {
              // Afficher une notification si les permissions sont accordées
              if (state.permissionStatus === 'granted' && isMobile) {
                showLocationSettingsNotification();
              } else {
                // Proposer d'activer les notifications
                requestNotificationPermission();
              }
            }
          }}
          className="px-3 py-1 bg-primary text-primary-foreground rounded text-sm"
        >
          {actionText}
        </button>
      ) : undefined,
    });

    // Si les notifications sont activées, envoyer un rappel après 30 secondes
    if (state.permissionStatus === 'granted' && error.code === GeolocationPositionError.PERMISSION_DENIED) {
      setTimeout(() => {
        showLocationSettingsNotification();
      }, 30000);
    }
  }, [getBrowserInfo, state.permissionStatus, showLocationSettingsNotification, requestNotificationPermission]);

  // Vérifier le statut des permissions au montage
  useEffect(() => {
    if ('Notification' in window) {
      setState(prev => ({ ...prev, permissionStatus: Notification.permission }));
    }
  }, []);

  return {
    requestNotificationPermission,
    showLocationSettingsNotification,
    handleGeolocationError,
    permissionStatus: state.permissionStatus,
  };
}