import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.brewit.game', // à remplacer par ton Bundle ID App Store Connect
  appName: 'Brew It',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    backgroundColor: '#1a1423',
    scrollEnabled: false,
  },
};

export default config;
