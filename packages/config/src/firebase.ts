import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, Firestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, FirebaseStorage, connectStorageEmulator } from "firebase/storage";

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "",
};

function initializeFirebase(): FirebaseApp {
    if (getApps().length > 0) {
        return getApp();
    }
    return initializeApp(firebaseConfig);
}

export const app: FirebaseApp = initializeFirebase();
export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);

// Emulator wiring lives here (not just in apps/web/src/lib/firebase/client.ts)
// so that routes which import only from @digimine/config — e.g. the teacher /
// institute layouts via useAuth / useUser — still talk to the local emulator
// suite. Without this, a hard reload on /teacher/* hits the real project, the
// session isn't there, and the user gets bounced to /login.
const useEmulators =
    typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "1";

if (useEmulators && typeof window !== "undefined") {
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
}
