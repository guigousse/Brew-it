import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.guigousse.brewit', // Bundle ID App Store Connect
  appName: 'Brew It',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    backgroundColor: '#1a1423',
    scrollEnabled: false,
  },
};

export default config;
