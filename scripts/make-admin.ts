import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, Timestamp } from "firebase/firestore";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });
// Also try local env
dotenv.config({ path: "apps/admin/.env.local" });

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Check if config is loaded
if (!firebaseConfig.apiKey) {
    console.error("❌ Error: Firebase environment variables not found!");
    process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const ADMIN_EMAIL = process.argv[2] || "admin@digimine.com";
const ADMIN_UID = process.argv[3]; // Optional: if you know the UID

async function makeAdmin() {
    if (!ADMIN_UID) {
        console.log(`Usage: ts-node scripts/make-admin.ts <email> <uid>`);
        console.log(`Please provide the UID from the Firebase Console or Auth logs.`);
        process.exit(1);
    }

    console.log(`Making user ${ADMIN_EMAIL} (${ADMIN_UID}) an admin...`);

    const userRef = doc(db, "users", ADMIN_UID);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
        await setDoc(userRef, { role: "admin" }, { merge: true });
        console.log(`✅ Updated existing user ${ADMIN_UID} to admin role.`);
    } else {
        await setDoc(userRef, {
            email: ADMIN_EMAIL,
            role: "admin",
            displayName: "Admin User",
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        });
        console.log(`✅ Created new admin user document for ${ADMIN_UID}.`);
    }

    process.exit(0);
}

makeAdmin().catch(console.error);
