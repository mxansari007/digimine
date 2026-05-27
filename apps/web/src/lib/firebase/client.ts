"use client";

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { initAppCheck } from "./appCheck";

// Local-dev override: when `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=1`, route all
// Firebase reads/writes through the local emulator suite (auth on 9099,
// firestore on 8080, storage on 9199) instead of the real cloud project. The
// admin SDK on the server picks this up via its own env vars (set in
// .env.local; see docs/firebase-emulators.md).
const USE_EMULATORS = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "1";

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase
function initializeFirebaseClient(): FirebaseApp {
    if (getApps().length > 0) {
        return getApp();
    }
    return initializeApp(firebaseConfig);
}

const app = initializeFirebaseClient();

// App Check MUST initialise before any Firebase service (Auth, Firestore,
// Storage) makes its first request, otherwise those requests go out without
// an attestation token and get rejected once enforcement is on. The
// `initAppCheck` helper is env-gated and a no-op when the v3 site key isn't
// configured — safe to call unconditionally. Skip App Check entirely against
// the local emulator suite (emulators bypass App Check by design).
if (!USE_EMULATORS) initAppCheck(app);

const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Wire each service to its local emulator port. `connectXEmulator` is
// idempotent across the React Fast Refresh lifecycle as long as we set
// the appropriate guards — Firebase will throw "already connected" if
// called twice, hence the try/catch.
if (USE_EMULATORS && typeof window !== "undefined") {
    try {
        connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
    } catch {
        /* already connected on hot reload */
    }
    try {
        connectFirestoreEmulator(db, "localhost", 8080);
    } catch {
        /* already connected on hot reload */
    }
    try {
        connectStorageEmulator(storage, "localhost", 9199);
    } catch {
        /* already connected on hot reload */
    }
    // Visible banner in dev console so testers never wonder why prod data
    // isn't showing up locally.
    // eslint-disable-next-line no-console
    console.warn(
        "%c[Firebase] Emulator mode — all reads/writes go to localhost (auth:9099 firestore:8080 storage:9199)",
        "background:#fbbf24;color:#000;padding:2px 6px;border-radius:3px;font-weight:bold"
    );
}

export { app, auth, db, storage };
