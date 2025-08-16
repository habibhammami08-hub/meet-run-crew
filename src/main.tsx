import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Debug logs pour vérifier l'injection des variables d'environnement au build
console.log("[BUILD] VITE_SUPABASE_URL present =", Boolean(import.meta.env?.VITE_SUPABASE_URL));
console.log("[BUILD] VITE_SUPABASE_ANON_KEY present =", Boolean(import.meta.env?.VITE_SUPABASE_ANON_KEY));
console.log("[BUILD] VITE_STRIPE_PUBLISHABLE_KEY present =", Boolean(import.meta.env?.VITE_STRIPE_PUBLISHABLE_KEY));
console.log("[BUILD] VITE_SITE_URL present =", Boolean(import.meta.env?.VITE_SITE_URL));
console.log("[BUILD] VITE_STRIPE_BUY_BUTTON_ID present =", Boolean(import.meta.env?.VITE_STRIPE_BUY_BUTTON_ID));
console.log("[BUILD] Total VITE_ vars =", Object.keys(import.meta.env || {}).filter(k => k.startsWith('VITE_')).length);

createRoot(document.getElementById("root")!).render(<App />);
