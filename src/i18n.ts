import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translations
import frTranslations from './locales/fr.json';
import enTranslations from './locales/en.json';

const resources = {
  fr: {
    translation: frTranslations,
  },
  en: {
    translation: enTranslations,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    
    // Language detection configuration
    detection: {
      // Order of detection methods
      order: ['localStorage', 'navigator', 'htmlTag'],
      
      // Cache user language
      caches: ['localStorage'],
      
      // Storage key
      lookupLocalStorage: 'meetrun-language',
      
      // Don't convert country codes to languages (fr-FR stays fr-FR)
      convertDetectedLanguage: (lng: string) => {
        // Convert regional codes to base language with fallback
        // fr-FR, fr-CA -> fr
        // en-US, en-GB -> en
        const baseLanguage = lng.split('-')[0];
        return ['fr', 'en'].includes(baseLanguage) ? baseLanguage : 'fr';
      },
    },

    // Fallback configuration
    fallbackLng: {
      'fr-FR': ['fr', 'en'],
      'fr-CA': ['fr', 'en'],
      'en-US': ['en', 'fr'],
      'en-GB': ['en', 'fr'],
      'default': ['fr', 'en'],
    },

    // Default namespace
    defaultNS: 'translation',
    
    // Development options
    debug: import.meta.env.DEV,

    // Interpolation options
    interpolation: {
      escapeValue: false, // React already does escaping
    },

    // React specific options
    react: {
      useSuspense: false, // Avoid suspense issues during SSR/hydration
    },

    // Key separator
    keySeparator: '.',
    
    // Namespace separator
    nsSeparator: ':',
  });

export default i18n;

// Helper functions for common patterns
export const i18nHelpers = {
  // Get current language
  getCurrentLanguage: () => i18n.language,
  
  // Change language
  changeLanguage: (lng: string) => i18n.changeLanguage(lng),
  
  // Check if key exists
  exists: (key: string) => i18n.exists(key),
  
  // Get available languages
  getAvailableLanguages: () => Object.keys(resources),
  
  // Format with interpolation
  format: (key: string, options?: Record<string, unknown>) => i18n.t(key, options),
};