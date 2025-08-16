/**
 * Notifications abstraction layer
 * Ready for native mobile: will support both Web Push and APNs/FCM
 */

export enum NotificationPermission {
  GRANTED = 'granted',
  DENIED = 'denied',
  DEFAULT = 'default',
}

export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
  actions?: Array<{
    action: string;
    title: string;
    icon?: string;
  }>;
}

export interface NotificationInterface {
  // Permission management
  getPermission(): Promise<NotificationPermission>;
  requestPermission(): Promise<NotificationPermission>;
  
  // Subscription management (for push notifications)
  subscribe(): Promise<PushSubscription | null>;
  unsubscribe(): Promise<boolean>;
  getSubscription(): Promise<PushSubscription | null>;
  
  // Local notifications
  showNotification(payload: NotificationPayload): Promise<void>;
  
  // Event handlers
  onNotificationClick(handler: (data: Record<string, unknown>) => void): void;
  onNotificationReceived(handler: (payload: NotificationPayload) => void): void;
}

/**
 * Web implementation using Service Worker and Push API
 * TODO: Add FCM/APNs support for native mobile
 */
class WebNotifications implements NotificationInterface {
  private serviceWorkerRegistration: ServiceWorkerRegistration | null = null;
  private vapidPublicKey: string | null = null;

  constructor() {
    this.init();
  }

  private async init() {
    if ('serviceWorker' in navigator) {
      try {
        this.serviceWorkerRegistration = await navigator.serviceWorker.ready;
      } catch (error) {
        console.warn('Service Worker not ready:', error);
      }
    }
  }

  async getPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) {
      return NotificationPermission.DENIED;
    }
    
    return Notification.permission as NotificationPermission;
  }

  async requestPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) {
      console.warn('Notifications not supported');
      return NotificationPermission.DENIED;
    }

    const permission = await Notification.requestPermission();
    return permission as NotificationPermission;
  }

  async subscribe(): Promise<PushSubscription | null> {
    // TODO: Implement with VAPID keys from environment
    console.warn('Push subscription not yet implemented');
    return null;
    
    /*
    if (!this.serviceWorkerRegistration || !this.vapidPublicKey) {
      return null;
    }

    try {
      const subscription = await this.serviceWorkerRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(this.vapidPublicKey),
      });

      return {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')!))),
          auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth')!))),
        },
      };
    } catch (error) {
      console.error('Push subscription failed:', error);
      return null;
    }
    */
  }

  async unsubscribe(): Promise<boolean> {
    if (!this.serviceWorkerRegistration) {
      return false;
    }

    try {
      const subscription = await this.serviceWorkerRegistration.pushManager.getSubscription();
      if (subscription) {
        return await subscription.unsubscribe();
      }
      return true;
    } catch (error) {
      console.error('Unsubscribe failed:', error);
      return false;
    }
  }

  async getSubscription(): Promise<PushSubscription | null> {
    // TODO: Implement actual subscription retrieval
    return null;
  }

  async showNotification(payload: NotificationPayload): Promise<void> {
    const permission = await this.getPermission();
    
    if (permission !== NotificationPermission.GRANTED) {
      console.warn('Notification permission not granted');
      return;
    }

    try {
      if (this.serviceWorkerRegistration) {
        // Use service worker for better control
        await this.serviceWorkerRegistration.showNotification(payload.title, {
          body: payload.body,
          icon: payload.icon,
          badge: payload.badge,
          data: payload.data,
          tag: 'meetrun-notification',
          renotify: true,
        });
      } else {
        // Fallback to basic notification
        new Notification(payload.title, {
          body: payload.body,
          icon: payload.icon,
          data: payload.data,
        });
      }
    } catch (error) {
      console.error('Show notification failed:', error);
    }
  }

  onNotificationClick(handler: (data: Record<string, unknown>) => void): void {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'notification-click') {
          handler(event.data.data || {});
        }
      });
    }
  }

  onNotificationReceived(handler: (payload: NotificationPayload) => void): void {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'notification-received') {
          handler(event.data.payload);
        }
      });
    }
  }

  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    
    return outputArray;
  }
}

// Singleton instance
export const notifications: NotificationInterface = new WebNotifications();

// Helper functions for common use cases
export const notificationHelpers = {
  // Session notifications
  async notifyNewSession(sessionTitle: string, location: string) {
    await notifications.showNotification({
      title: '🏃‍♂️ Nouvelle session MeetRun',
      body: `${sessionTitle} à ${location}`,
      icon: '/icon-192.png',
      data: { type: 'new-session', sessionTitle, location },
    });
  },

  // Enrollment notifications
  async notifyEnrollmentConfirmed(sessionTitle: string) {
    await notifications.showNotification({
      title: '✅ Inscription confirmée',
      body: `Vous êtes inscrit à "${sessionTitle}"`,
      icon: '/icon-192.png',
      data: { type: 'enrollment-confirmed', sessionTitle },
    });
  },

  // Reminder notifications
  async notifySessionReminder(sessionTitle: string, timeUntil: string) {
    await notifications.showNotification({
      title: '⏰ Session bientôt !',
      body: `"${sessionTitle}" commence dans ${timeUntil}`,
      icon: '/icon-192.png',
      data: { type: 'session-reminder', sessionTitle, timeUntil },
    });
  },
};

// TODO: For native mobile builds, integrate with Capacitor Push Notifications
/*
import { PushNotifications } from '@capacitor/push-notifications';

class NativePushNotifications implements NotificationInterface {
  async requestPermission(): Promise<NotificationPermission> {
    const result = await PushNotifications.requestPermissions();
    return result.receive === 'granted' ? NotificationPermission.GRANTED : NotificationPermission.DENIED;
  }

  async subscribe(): Promise<PushSubscription | null> {
    await PushNotifications.register();
    // Handle FCM token for Android, APNs token for iOS
    return null;
  }

  // ... implement other methods for native platforms
}
*/