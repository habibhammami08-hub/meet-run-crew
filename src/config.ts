import { z } from 'zod';

// Configuration schema validation
const configSchema = z.object({
  // App Information
  APP_NAME: z.string().default('MeetRun'),
  APP_VERSION: z.string().default('1.0.0'),
  APP_URL: z.string().url().optional(),
  
  // Supabase Configuration
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  
  // Stripe Configuration  
  STRIPE_PUBLIC_KEY: z.string().min(1),
  
  // Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Deep Links
  DEEP_LINK_SCHEME: z.string().default('meetrun'),
  
  // PWA
  ENABLE_SW: z.boolean().default(true),
});

// Extract environment variables
const getEnvVars = () => {
  // Vite environment variables
  const env = import.meta.env;
  
  return {
    APP_NAME: env.VITE_APP_NAME,
    APP_VERSION: env.VITE_APP_VERSION,
    APP_URL: env.VITE_APP_URL,
    SUPABASE_URL: env.VITE_SUPABASE_URL,
    SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY,
    STRIPE_PUBLIC_KEY: env.VITE_STRIPE_PUBLIC_KEY,
    NODE_ENV: env.MODE,
    DEEP_LINK_SCHEME: env.VITE_DEEP_LINK_SCHEME,
    ENABLE_SW: env.VITE_ENABLE_SW !== 'false',
  };
};

// Validate and create config
const createConfig = () => {
  try {
    const envVars = getEnvVars();
    const parsed = configSchema.parse(envVars);
    
    return {
      ...parsed,
      // Computed values
      isProduction: parsed.NODE_ENV === 'production',
      isDevelopment: parsed.NODE_ENV === 'development',
      isTest: parsed.NODE_ENV === 'test',
      
      // Deep link URL helper
      createDeepLink: (path: string) => `${parsed.DEEP_LINK_SCHEME}://${path}`,
      
      // API endpoints (if needed later)
      api: {
        base: parsed.SUPABASE_URL,
      },
    } as const;
  } catch (error) {
    console.error('Configuration validation failed:', error);
    throw new Error(
      `Invalid configuration. Please check your environment variables. Error: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
};

// Export frozen config object
export const config = createConfig();

// Development helper
if (config.isDevelopment) {
  console.log('📱 MeetRun Configuration:', {
    environment: config.NODE_ENV,
    deepLinkScheme: config.DEEP_LINK_SCHEME,
    serviceWorkerEnabled: config.ENABLE_SW,
    supabaseUrl: config.SUPABASE_URL,
  });
}

export type Config = typeof config;