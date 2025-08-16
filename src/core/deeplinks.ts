/**
 * Deep Links abstraction layer
 * Ready for native mobile: will support Universal Links (iOS) and App Links (Android)
 */

import { config } from '@/config';

export interface DeepLinkHandler {
  path: string;
  handler: (params: Record<string, string>) => void;
}

export interface DeepLinksInterface {
  // Register deep link handlers
  registerHandler(pattern: string, handler: (params: Record<string, string>) => void): void;
  
  // Handle incoming deep link
  handleDeepLink(url: string): boolean;
  
  // Create deep link URLs
  createDeepLink(path: string, params?: Record<string, string>): string;
  
  // Initialize deep link handling
  initialize(): void;
}

/**
 * Web implementation with URL protocol handling
 * TODO: Add Universal Links (iOS) and App Links (Android) for native mobile
 */
class WebDeepLinks implements DeepLinksInterface {
  private handlers: Map<string, (params: Record<string, string>) => void> = new Map();
  private initialized = false;

  initialize(): void {
    if (this.initialized) return;
    
    // Listen for protocol handler registrations
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'deep-link') {
          this.handleDeepLink(event.data.url);
        }
      });
    }
    
    // Check for deep link in current URL on app start
    this.checkInitialDeepLink();
    
    this.initialized = true;
    console.log('🔗 Deep links initialized with scheme:', config.DEEP_LINK_SCHEME);
  }

  registerHandler(pattern: string, handler: (params: Record<string, string>) => void): void {
    this.handlers.set(pattern, handler);
    console.log('📝 Registered deep link handler for:', pattern);
  }

  handleDeepLink(url: string): boolean {
    try {
      const deepLinkUrl = new URL(url);
      
      // Check if it's our custom scheme
      if (deepLinkUrl.protocol !== `${config.DEEP_LINK_SCHEME}:`) {
        return false;
      }
      
      const path = deepLinkUrl.pathname || deepLinkUrl.hostname;
      const searchParams = Object.fromEntries(deepLinkUrl.searchParams.entries());
      
      console.log('🔗 Processing deep link:', { path, params: searchParams });
      
      // Find matching handler
      for (const [pattern, handler] of this.handlers) {
        const params = this.matchPattern(pattern, path);
        if (params) {
          console.log('✅ Deep link matched pattern:', pattern);
          handler({ ...params, ...searchParams });
          return true;
        }
      }
      
      // Default handler - navigate to path if no specific handler found
      this.defaultHandler(path, searchParams);
      return true;
      
    } catch (error) {
      console.warn('Failed to parse deep link URL:', url, error);
      return false;
    }
  }

  createDeepLink(path: string, params?: Record<string, string>): string {
    const url = new URL(`${config.DEEP_LINK_SCHEME}://${path}`);
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }
    
    return url.toString();
  }

  private checkInitialDeepLink(): void {
    // Check if the app was opened with a deep link
    const urlParams = new URLSearchParams(window.location.search);
    const deepLink = urlParams.get('deeplink');
    
    if (deepLink) {
      console.log('🚀 App opened with deep link:', deepLink);
      this.handleDeepLink(decodeURIComponent(deepLink));
    }
  }

  private matchPattern(pattern: string, path: string): Record<string, string> | null {
    // Simple pattern matching: /session/:id -> /session/123
    const patternParts = pattern.split('/').filter(Boolean);
    const pathParts = path.split('/').filter(Boolean);
    
    if (patternParts.length !== pathParts.length) {
      return null;
    }
    
    const params: Record<string, string> = {};
    
    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i];
      const pathPart = pathParts[i];
      
      if (patternPart.startsWith(':')) {
        // Parameter
        const paramName = patternPart.slice(1);
        params[paramName] = pathPart;
      } else if (patternPart !== pathPart) {
        // Literal part doesn't match
        return null;
      }
    }
    
    return params;
  }

  private defaultHandler(path: string, params: Record<string, string>): void {
    // Default behavior: navigate to the path in the web router
    console.log('🔗 Using default deep link handler for:', path, params);
    
    // Import router dynamically to avoid circular dependencies
    import('react-router-dom').then(({ useNavigate }) => {
      // Note: This won't work directly, we need to handle it differently
      // The actual navigation should be handled by the registered handlers
      console.log('📱 Deep link navigation to:', path, params);
      
      // For now, just update the URL
      const url = new URL(window.location.href);
      url.pathname = path;
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
      
      window.history.pushState({}, '', url.pathname + url.search);
    });
  }
}

// Singleton instance
export const deepLinks: DeepLinksInterface = new WebDeepLinks();

// Helper functions for common deep link scenarios
export const deepLinkHelpers = {
  // Session deep links
  createSessionLink: (sessionId: string) => 
    deepLinks.createDeepLink(`/session/${sessionId}`),
  
  // Map with filters
  createMapLink: (filters?: Record<string, string>) => 
    deepLinks.createDeepLink('/map', filters),
  
  // Profile deep link
  createProfileLink: (userId?: string) => 
    deepLinks.createDeepLink('/profile', userId ? { user: userId } : undefined),
  
  // Share session
  shareSession: async (sessionId: string, sessionTitle: string) => {
    const deepLink = deepLinkHelpers.createSessionLink(sessionId);
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: `MeetRun - ${sessionTitle}`,
          text: `Rejoignez cette session de running : ${sessionTitle}`,
          url: deepLink,
        });
        return true;
      } catch (error) {
        console.log('Share cancelled or failed:', error);
      }
    }
    
    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(deepLink);
      return true;
    } catch (error) {
      console.warn('Failed to copy deep link:', error);
      return false;
    }
  },
};

// Register common deep link handlers
export const registerCommonHandlers = (navigate: (path: string) => void) => {
  // Session details
  deepLinks.registerHandler('/session/:id', (params) => {
    navigate(`/session/${params.id}`);
  });
  
  // Map with filters
  deepLinks.registerHandler('/map', (params) => {
    const queryString = new URLSearchParams(params).toString();
    navigate(`/map${queryString ? `?${queryString}` : ''}`);
  });
  
  // Profile
  deepLinks.registerHandler('/profile', (params) => {
    const queryString = new URLSearchParams(params).toString();
    navigate(`/profile${queryString ? `?${queryString}` : ''}`);
  });
  
  // Create session
  deepLinks.registerHandler('/create', () => {
    navigate('/create');
  });
  
  // Home
  deepLinks.registerHandler('/', () => {
    navigate('/');
  });
};

// TODO: For native mobile builds, integrate with Capacitor App
/*
import { App } from '@capacitor/app';

class NativeDeepLinks implements DeepLinksInterface {
  initialize(): void {
    App.addListener('appUrlOpen', (event) => {
      this.handleDeepLink(event.url);
    });
    
    // Handle app state changes
    App.addListener('appStateChange', (state) => {
      if (state.isActive) {
        // Check for pending deep links
        this.checkPendingDeepLinks();
      }
    });
  }

  // ... implement other methods for native platforms
}
*/