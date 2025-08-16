/**
 * Storage abstraction layer
 * Ready for native mobile: will switch to Capacitor SecureStorage for sensitive data
 */

export interface StorageInterface {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
  getAllKeys(): Promise<string[]>;
}

/**
 * Web implementation using localStorage with fallback to sessionStorage
 * TODO: Replace with Capacitor SecureStorage for mobile builds
 */
class WebStorage implements StorageInterface {
  private storage: Storage;

  constructor() {
    // Try localStorage first, fallback to sessionStorage
    try {
      localStorage.setItem('test', 'test');
      localStorage.removeItem('test');
      this.storage = localStorage;
    } catch {
      this.storage = sessionStorage;
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      return this.storage.getItem(key);
    } catch (error) {
      console.warn(`Storage get error for key "${key}":`, error);
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    try {
      this.storage.setItem(key, value);
    } catch (error) {
      console.error(`Storage set error for key "${key}":`, error);
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      this.storage.removeItem(key);
    } catch (error) {
      console.warn(`Storage remove error for key "${key}":`, error);
    }
  }

  async clear(): Promise<void> {
    try {
      this.storage.clear();
    } catch (error) {
      console.error('Storage clear error:', error);
      throw error;
    }
  }

  async getAllKeys(): Promise<string[]> {
    try {
      return Object.keys(this.storage);
    } catch (error) {
      console.warn('Storage getAllKeys error:', error);
      return [];
    }
  }
}

// Singleton instance
export const storage: StorageInterface = new WebStorage();

// Higher-level helpers for common use cases
export const storageHelpers = {
  // JSON helpers
  async getJSON<T>(key: string): Promise<T | null> {
    try {
      const value = await storage.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.warn(`Failed to parse JSON for key "${key}":`, error);
      return null;
    }
  },

  async setJSON<T>(key: string, value: T): Promise<void> {
    try {
      await storage.set(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Failed to stringify JSON for key "${key}":`, error);
      throw error;
    }
  },

  // Auth specific helpers
  async getAuthToken(): Promise<string | null> {
    return storage.get('auth.token');
  },

  async setAuthToken(token: string): Promise<void> {
    return storage.set('auth.token', token);
  },

  async clearAuthData(): Promise<void> {
    const authKeys = (await storage.getAllKeys()).filter(key => 
      key.startsWith('auth.') || key.startsWith('sb-')
    );
    
    for (const key of authKeys) {
      await storage.remove(key);
    }
  },

  // User preferences
  async getUserPrefs(): Promise<Record<string, unknown> | null> {
    return this.getJSON('user.preferences');
  },

  async setUserPrefs(prefs: Record<string, unknown>): Promise<void> {
    return this.setJSON('user.preferences', prefs);
  },
};

// TODO: For native mobile builds, replace WebStorage with:
/*
import { SecureStorage } from '@ionic-native/secure-storage/ngx';

class NativeSecureStorage implements StorageInterface {
  private secureStorage: SecureStorage;

  constructor() {
    this.secureStorage = new SecureStorage();
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.secureStorage.get(key);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    await this.secureStorage.set(key, value);
  }

  async remove(key: string): Promise<void> {
    await this.secureStorage.remove(key);
  }

  // ... implement other methods
}
*/