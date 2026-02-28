import type { CapacitorConfig } from '@capacitor/cli';

    const config: CapacitorConfig = {
      appId: 'cc.selrs.app',
      appName: 'SELRS',
      webDir: 'dist/public',
      server: {
        url: 'https://op.selrs.cc',
        cleartext: false,
        allowNavigation: ['op.selrs.cc']
      }
    };

    export default config;