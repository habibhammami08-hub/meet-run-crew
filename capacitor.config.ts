import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.a2b2f38d10604da2b70b5d0ae2308f6a',
  appName: 'meet-run-crew',
  webDir: 'dist',
  server: {
    url: 'https://a2b2f38d-1060-4da2-b70b-5d0ae2308f6a.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  plugins: {
    Geolocation: {
      permissions: ['location']
    }
  }
};

export default config;