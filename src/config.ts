declare global {
  interface Window { __ENV?: Record<string, string>; }
}

const read = (key: string) => {
  // priorité aux VITE_* du build, puis fallback sur env.js
  // @ts-ignore
  const viteVal = import.meta.env?.[key as keyof ImportMetaEnv];
  const winVal = typeof window !== 'undefined' ? window.__ENV?.[key] : undefined;
  return viteVal ?? winVal ?? undefined;
};

export const CONFIG = {
  SUPABASE_URL: read('VITE_SUPABASE_URL'),
  SUPABASE_ANON_KEY: read('VITE_SUPABASE_ANON_KEY'),
  STRIPE_PUBLISHABLE_KEY: read('VITE_STRIPE_PUBLISHABLE_KEY'),
  STRIPE_BUY_BUTTON_ID: read('VITE_STRIPE_BUY_BUTTON_ID'),
  SITE_URL: read('VITE_SITE_URL'),
  GOOGLE_MAPS_API_KEY: read('VITE_GOOGLE_MAPS_API_KEY'),
};

export const ENV_STATUS = {
  vite: {
    VITE_SUPABASE_URL: Boolean((import.meta as any)?.env?.VITE_SUPABASE_URL),
    VITE_SUPABASE_ANON_KEY: Boolean((import.meta as any)?.env?.VITE_SUPABASE_ANON_KEY),
    VITE_STRIPE_PUBLISHABLE_KEY: Boolean((import.meta as any)?.env?.VITE_STRIPE_PUBLISHABLE_KEY),
    VITE_STRIPE_BUY_BUTTON_ID: Boolean((import.meta as any)?.env?.VITE_STRIPE_BUY_BUTTON_ID),
    VITE_SITE_URL: Boolean((import.meta as any)?.env?.VITE_SITE_URL),
    VITE_GOOGLE_MAPS_API_KEY: Boolean((import.meta as any)?.env?.VITE_GOOGLE_MAPS_API_KEY),
  },
  win: {
    VITE_SUPABASE_URL: typeof window !== 'undefined' && Boolean(window.__ENV?.VITE_SUPABASE_URL),
    VITE_SUPABASE_ANON_KEY: typeof window !== 'undefined' && Boolean(window.__ENV?.VITE_SUPABASE_ANON_KEY),
    VITE_STRIPE_PUBLISHABLE_KEY: typeof window !== 'undefined' && Boolean(window.__ENV?.VITE_STRIPE_PUBLISHABLE_KEY),
    VITE_STRIPE_BUY_BUTTON_ID: typeof window !== 'undefined' && Boolean(window.__ENV?.VITE_STRIPE_BUY_BUTTON_ID),
    VITE_SITE_URL: typeof window !== 'undefined' && Boolean(window.__ENV?.VITE_SITE_URL),
    VITE_GOOGLE_MAPS_API_KEY: typeof window !== 'undefined' && Boolean(window.__ENV?.VITE_GOOGLE_MAPS_API_KEY),
  }
};