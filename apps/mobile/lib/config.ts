import { Platform } from "react-native";

/**
 * Where the PlacementRanker backend lives. The mobile app talks to the SAME
 * Next.js API routes as the web app (Firebase ID token via Authorization:
 * Bearer), so pointing this at any deployment of apps/web is all the backend
 * setup there is.
 *
 *   - Override with EXPO_PUBLIC_API_URL (e.g. the production Vercel URL).
 *   - Default: the local `next dev` server on port 3000. Android emulators
 *     reach the host machine via 10.0.2.2, iOS simulators via localhost.
 */
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  Platform.select({
    android: "http://10.0.2.2:3000",
    default: "http://localhost:3000",
  });

/**
 * Local-dev override, mirroring the web app's
 * NEXT_PUBLIC_USE_FIREBASE_EMULATORS: when "1", sign in against the local
 * Firebase AUTH EMULATOR (where `pnpm seed:emulators` creates the
 * @test.com accounts) instead of the real cloud project. Must match what
 * the API server uses — emulator tokens don't validate against prod and
 * vice versa. Set in apps/mobile/.env.
 */
export const USE_FIREBASE_EMULATORS =
  process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === "1";

/** Emulator host as seen FROM the device/emulator (Android maps host → 10.0.2.2). */
export const EMULATOR_HOST = Platform.select({
  android: "10.0.2.2",
  default: "localhost",
});

/** Auth emulator URL as seen FROM the device/emulator (not the host). */
export const AUTH_EMULATOR_URL = `http://${EMULATOR_HOST}:9099`;

/** Storage emulator port (mirrors firebase.json). */
export const STORAGE_EMULATOR_PORT = 9199;

/**
 * Google sign-in: the OAuth **Web** client id of the Firebase project
 * (digimine-1c33f) — Google Cloud Console → APIs & Services → Credentials →
 * OAuth 2.0 Client IDs → "Web client". Firebase uses it to verify the Google
 * id token the native sign-in returns. Defaults to the project's public Web
 * client id (below) so the "Continue with Google" button works out of the box;
 * EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID overrides it (inlined at bundle time, so
 * restart `expo start` / rebuild after changing the env var).
 */
export const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
  // Public OAuth Web client id for digimine-1c33f — the same value that ships
  // in google-services.json, and a public client identifier like the
  // firebaseConfig below (not a secret).
  "775565039718-6oaejftukqr0s58kbsm57kjmgrjaokli.apps.googleusercontent.com";

/**
 * Firebase client config — same project the web app uses (digimine-1c33f).
 * These values are public client identifiers (they ship in the web bundle
 * today); security comes from Firestore rules + server-side token checks.
 */
export const firebaseConfig = {
  apiKey: "AIzaSyBT0Ztti3Gy63FX_8ta-FxS1TINEYWl7oo",
  authDomain: "digimine-1c33f.firebaseapp.com",
  projectId: "digimine-1c33f",
  storageBucket: "digimine-1c33f.firebasestorage.app",
  messagingSenderId: "775565039718",
  appId: "1:775565039718:web:f6eab715fe42bb5f7c35a7",
};
