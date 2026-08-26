import type { CapacitorConfig } from '@capacitor/cli';

// Bump this token on every APK release to force the WebView to bypass
// any cached HTML/JS from a prior install.
const RELEASE_TOKEN = '20260821-1';

// Where the APK gets its web content.
//
//   default          -> bundles the local `dist` build into the APK.
//                       Always the code in this repo. Needs a new APK per change.
//   CAP_REMOTE=1     -> loads https://bb.quickapp.ai instead, so web fixes ship
//                       without a new APK.
//
// Remote is OFF by default because bb.quickapp.ai currently serves an older
// build than this repo, and that build white-screens inside the Android
// WebView (TypeError: ...reading 'toLowerCase'). Re-enable it once the site
// has been republished from this codebase:
//
//   CAP_REMOTE=1 npm run sync:android
//
const USE_REMOTE = process.env.CAP_REMOTE === '1';

const config: CapacitorConfig = {
  appId: 'ai.quickapp.fieldforce',
  appName: 'QuickLocate',
  webDir: 'dist',
  ...(USE_REMOTE
    ? {
        server: {
          url: `https://bb.quickapp.ai?v=${RELEASE_TOKEN}&forceHideBadge=true`,
          androidScheme: 'https',
          allowNavigation: ['bb.quickapp.ai', '*.quickapp.ai'],
        },
      }
    : {}),
  android: {
    // Allow WebView to handle camera/location permission prompts
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    Camera: {
      permissions: ['camera'],
    },
    Geolocation: {
      permissions: ['location', 'coarseLocation'],
    },
    Microphone: {
      permissions: ['microphone'],
    },
    Filesystem: {
      permissions: ['publicStorage'],
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
