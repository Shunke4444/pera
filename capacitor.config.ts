import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.pera.tracker',
  appName: 'Pera',
  webDir: 'dist',
  plugins: {
    // Plain, UNENCRYPTED SQLite so native Kotlin (the widget, Phase 4) can open
    // the same peraSQLite.db file with no key. Sharing one DB is the whole point
    // of the pivot — see _local/032.
    CapacitorSQLite: {
      androidIsEncryption: false,
    },
  },
};

export default config;
