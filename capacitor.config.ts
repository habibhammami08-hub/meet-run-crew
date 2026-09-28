import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.a2b2f38d10604da2b70b5d0ae2308f6a',
  appName: 'meet-run',
  webDir: 'dist',
  server: {
    url: 'https://www.meetrun.fr',
    cleartext: true
  },
  plugins: {
    Geolocation: {
      permissions: ['location']
    }
  }
};

export default config;