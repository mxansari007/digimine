/**
 * Native Google sign-in — fully guarded, like `lib/push.ts`.
 *
 * `@react-native-google-signin/google-signin` is a NATIVE module that Expo Go
 * does not bundle, so even `require()`-ing it there throws. We detect the
 * runtime first and only pull the module in on a real dev/standalone build.
 * In Expo Go the "Continue with Google" button explains it needs the built app.
 *
 * Flow: native Google account chooser → Google ID token → exchanged with
 * Firebase via `signInWithCredential` (see contexts/AuthContext). `configure`
 * needs the project's OAuth **Web** client id (EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID).
 * Android also requires the app's signing SHA-1/SHA-256 registered in Firebase.
 */
import Constants from "expo-constants";
// Type-only import — erased at build time, never executes the native module.
import type * as GSI from "@react-native-google-signin/google-signin";
import { GOOGLE_WEB_CLIENT_ID } from "./config";

const isExpoGo =
  Constants.appOwnership === "expo" ||
  Constants.executionEnvironment === "storeClient";

/** A web client id is set AND we are in a build that bundles the native module. */
export function isGoogleSignInAvailable(): boolean {
  return !isExpoGo && Boolean(GOOGLE_WEB_CLIENT_ID);
}

/** Whether a web client id has been configured at all — gates button visibility. */
export function isGoogleConfigured(): boolean {
  return Boolean(GOOGLE_WEB_CLIENT_ID);
}

/** Human reason the button can't run yet, or null if it can. */
export function googleUnavailableReason(): string | null {
  if (!GOOGLE_WEB_CLIENT_ID) return "Google sign-in isn't configured yet.";
  if (isExpoGo) return "Google sign-in only works in the installed app, not Expo Go.";
  return null;
}

let configured = false;
function gsi(): typeof GSI {
  // Only ever reached on a real build (callers gate on isGoogleSignInAvailable).
  return require("@react-native-google-signin/google-signin");
}

function ensureConfigured() {
  if (configured) return;
  gsi().GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
  configured = true;
}

/**
 * Open the native Google chooser and return a Firebase-ready ID token.
 * Resolves to null when the user cancels; throws on a real failure.
 */
export async function googleSignInIdToken(): Promise<string | null> {
  const { GoogleSignin, isSuccessResponse } = gsi();
  ensureConfigured();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) return null; // user cancelled
  const idToken = response.data.idToken;
  if (!idToken) {
    throw new Error("Google didn't return an ID token — check the Web client id.");
  }
  return idToken;
}

/** Best-effort Google sign-out so the next login re-shows the account chooser. */
export async function googleSignOut(): Promise<void> {
  if (isExpoGo || !GOOGLE_WEB_CLIENT_ID) return;
  try {
    await gsi().GoogleSignin.signOut();
  } catch {
    /* ignore */
  }
}
