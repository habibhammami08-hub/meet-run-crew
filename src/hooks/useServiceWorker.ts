import { useState, useEffect } from 'react';
import { config } from '@/config';

interface ServiceWorkerState {
  isSupported: boolean;
  isRegistered: boolean;
  isUpdateAvailable: boolean;
  isInstalling: boolean;
  registration: ServiceWorkerRegistration | null;
  error: string | null;
}

interface ServiceWorkerActions {
  register: () => Promise<boolean>;
  update: () => Promise<boolean>;
  unregister: () => Promise<boolean>;
}

export const useServiceWorker = (): ServiceWorkerState & ServiceWorkerActions => {
  const [state, setState] = useState<ServiceWorkerState>({
    isSupported: 'serviceWorker' in navigator,
    isRegistered: false,
    isUpdateAvailable: false,
    isInstalling: false,
    registration: null,
    error: null,
  });

  const updateState = (updates: Partial<ServiceWorkerState>) => {
    setState(prev => ({ ...prev, ...updates }));
  };

  const register = async (): Promise<boolean> => {
    if (!state.isSupported) {
      updateState({ error: 'Service Worker not supported' });
      return false;
    }

    if (!config.ENABLE_SW) {
      console.log('🚫 Service Worker disabled by configuration');
      return false;
    }

    // Only enable in production and HTTPS
    if (!config.isProduction && location.protocol !== 'https:' && location.hostname !== 'localhost') {
      console.log('🚫 Service Worker only enabled in production or HTTPS');
      return false;
    }

    try {
      updateState({ isInstalling: true, error: null });

      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });

      console.log('✅ Service Worker registered:', registration);

      // Listen for updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              updateState({ isUpdateAvailable: true });
              console.log('🔄 Service Worker update available');
            }
          });
        }
      });

      updateState({
        isRegistered: true,
        isInstalling: false,
        registration,
      });

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Registration failed';
      console.error('❌ Service Worker registration failed:', error);
      updateState({
        isInstalling: false,
        error: errorMessage,
      });
      return false;
    }
  };

  const update = async (): Promise<boolean> => {
    if (!state.registration) {
      return false;
    }

    try {
      await state.registration.update();
      
      // Tell the waiting service worker to skip waiting
      if (state.registration.waiting) {
        state.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      // Reload the page to activate the new service worker
      window.location.reload();
      return true;
    } catch (error) {
      console.error('❌ Service Worker update failed:', error);
      return false;
    }
  };

  const unregister = async (): Promise<boolean> => {
    if (!state.registration) {
      return false;
    }

    try {
      await state.registration.unregister();
      updateState({
        isRegistered: false,
        isUpdateAvailable: false,
        registration: null,
      });
      console.log('🗑️ Service Worker unregistered');
      return true;
    } catch (error) {
      console.error('❌ Service Worker unregistration failed:', error);
      return false;
    }
  };

  // Auto-register on mount if enabled
  useEffect(() => {
    if (config.ENABLE_SW && state.isSupported && !state.isRegistered) {
      register();
    }
  }, []);

  // Listen for service worker controller changes
  useEffect(() => {
    if (!state.isSupported) return;

    const handleControllerChange = () => {
      console.log('🔄 Service Worker controller changed');
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, [state.isSupported]);

  return {
    ...state,
    register,
    update,
    unregister,
  };
};