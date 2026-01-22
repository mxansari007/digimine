import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// Initialize Firebase Admin SDK
admin.initializeApp();

// Firestore reference
const db = admin.firestore();

/**
 * Trigger: Create user document when a new Firebase Auth user is created
 */
export const onUserCreate = functions.auth.user().onCreate(async (user) => {
    const { uid, email, displayName, photoURL } = user;

    try {
        await db.collection("users").doc(uid).set({
            id: uid,
            email: email || null,
            displayName: displayName || null,
            photoURL: photoURL || null,
            role: "customer",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        functions.logger.info(`Created user document for ${uid}`);
    } catch (error) {
        functions.logger.error(`Error creating user document for ${uid}:`, error);
        throw error;
    }
});

/**
 * Trigger: Clean up user data when Firebase Auth user is deleted
 */
export const onUserDelete = functions.auth.user().onDelete(async (user) => {
    const { uid } = user;

    try {
        // Delete user document
        await db.collection("users").doc(uid).delete();

        // Delete user's storage files (avatars, etc.)
        const bucket = admin.storage().bucket();
        await bucket.deleteFiles({ prefix: `users/${uid}/` });

        functions.logger.info(`Cleaned up data for deleted user ${uid}`);
    } catch (error) {
        functions.logger.error(`Error cleaning up user ${uid}:`, error);
        throw error;
    }
});

/**
 * Callable: Process a payment (placeholder for Stripe/PayPal integration)
 */
export const processPayment = functions.https.onCall(async (data, context) => {
    // Ensure user is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError(
            "unauthenticated",
            "User must be authenticated to process payment"
        );
    }

    const { items, paymentMethod } = data;

    if (!items || !Array.isArray(items) || items.length === 0) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "Items array is required"
        );
    }

    // TODO: Implement payment processing with Stripe/PayPal
    functions.logger.info("Payment processing placeholder", {
        userId: context.auth.uid,
        items,
        paymentMethod,
    });

    return {
        success: true,
        message: "Payment processing not yet implemented",
    };
});

/**
 * HTTP: Health check endpoint
 */
export const healthCheck = functions.https.onRequest((_req, res) => {
    res.status(200).json({
        status: "healthy",
        timestamp: new Date().toISOString(),
    });
});
