import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Debug logs pour vérifier l'injection des variables d'environnement au build
if (import.meta.env.DEV) {
  console.log('[BUILD] SUPABASE_URL =', Boolean(import.meta.env?.VITE_SUPABASE_URL));
  console.log('[BUILD] SUPABASE_ANON =', Boolean(import.meta.env?.VITE_SUPABASE_ANON_KEY));
  console.log('[BUILD] STRIPE_PUBLISHABLE_KEY =', Boolean(import.meta.env?.VITE_STRIPE_PUBLISHABLE_KEY));
  console.log('[BUILD] STRIPE_BUY_BUTTON_ID =', Boolean(import.meta.env?.VITE_STRIPE_BUY_BUTTON_ID));
  console.log('[BUILD] SITE_URL =', Boolean(import.meta.env?.VITE_SITE_URL));
  console.log('[BUILD] Total VITE_ vars =', Object.keys(import.meta.env || {}).filter(k => k.startsWith('VITE_')).length);

  // Debug logs pour vérifier les variables au runtime (inclut fallback window.__ENV)
  import('./config').then(({ ENV_STATUS }) => {
    setTimeout(() => {
      console.log('[RUNTIME] ENV_STATUS.vite =', ENV_STATUS.vite);
      console.log('[RUNTIME] ENV_STATUS.win =', ENV_STATUS.win);
    }, 100);
  });
}

createRoot(document.getElementById("root")!).render(<App />);
