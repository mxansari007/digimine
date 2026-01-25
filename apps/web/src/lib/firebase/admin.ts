import { initializeApp, getApps, getApp, cert, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

// Initialize Firebase Admin for server-side usage
function initializeFirebaseAdmin(): App {
    if (getApps().length > 0) {
        return getApp();
    }

    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

    if (clientEmail && privateKey) {
        return initializeApp({
            credential: cert({
                projectId,
                clientEmail,
                privateKey,
            }),
        });
    }

    // Fallback for production environments (GCP/Vercel) where credentials might be auto-detected
    return initializeApp({
        projectId,
    });
}

let adminApp: App;
let adminDb: Firestore;

try {
    adminApp = initializeFirebaseAdmin();
    adminDb = getFirestore(adminApp);
} catch (error) {
    console.error("Firebase Admin initialization error:", error);
    // Best effort fallback
    if (getApps().length > 0) {
        adminApp = getApp();
        adminDb = getFirestore(adminApp);
    } else {
        throw error;
    }
}

export { adminApp, adminDb };
