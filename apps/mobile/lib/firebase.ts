import { getApp, getApps, initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  initializeAuth,
  // @ts-expect-error — exported by the react-native entry of firebase/auth,
  // which Metro resolves; the node types just don't declare it.
  getReactNativePersistence,
  type Auth,
} from "firebase/auth";
import { connectStorageEmulator, getStorage } from "firebase/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  AUTH_EMULATOR_URL,
  EMULATOR_HOST,
  firebaseConfig,
  STORAGE_EMULATOR_PORT,
  USE_FIREBASE_EMULATORS,
} from "./config";

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

/**
 * Auth with AsyncStorage persistence so a signed-in student stays signed in
 * across app launches (the default in-memory persistence forgets on restart).
 */
let auth: Auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  // initializeAuth throws if called twice (fast refresh) — fall back to the
  // already-initialized instance.
  auth = getAuth(app);
}

// Cloud Storage — class resource library uploads (PDF/PPT/video) go here.
const storage = getStorage(app);

// Local dev: point Auth + Storage at the emulator suite (same flags the web
// app uses) so the seeded @test.com accounts work and uploads land in the
// local bucket. Must run before the first request; throws on fast refresh if
// already connected — safe to swallow.
if (USE_FIREBASE_EMULATORS && AUTH_EMULATOR_URL) {
  try {
    connectAuthEmulator(auth, AUTH_EMULATOR_URL, { disableWarnings: true });
  } catch {
    /* already connected */
  }
  try {
    connectStorageEmulator(storage, EMULATOR_HOST as string, STORAGE_EMULATOR_PORT);
  } catch {
    /* already connected */
  }
}

export { app, auth, storage };
