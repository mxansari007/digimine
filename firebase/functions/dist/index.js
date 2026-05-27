"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.processPistonJob = exports.onOrderCreated = exports.onStudentEnrolled = exports.onQuestionCreated = exports.onCourseCreated = exports.onContestCreated = exports.onTestCreated = exports.onQuizCreated = exports.checkSubscriptionExpiry = exports.healthCheck = exports.processPayment = exports.onUserDelete = exports.onUserCreate = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
// Initialize Firebase Admin SDK
admin.initializeApp();
// Firestore reference
const db = admin.firestore();
/**
 * Trigger: Create user document when a new Firebase Auth user is created
 */
exports.onUserCreate = functions.auth.user().onCreate(async (user) => {
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
    }
    catch (error) {
        functions.logger.error(`Error creating user document for ${uid}:`, error);
        throw error;
    }
});
/**
 * Trigger: Clean up user data when Firebase Auth user is deleted
 */
exports.onUserDelete = functions.auth.user().onDelete(async (user) => {
    const { uid } = user;
    try {
        // Delete user document
        await db.collection("users").doc(uid).delete();
        // Delete user's storage files (avatars, etc.)
        const bucket = admin.storage().bucket();
        await bucket.deleteFiles({ prefix: `users/${uid}/` });
        functions.logger.info(`Cleaned up data for deleted user ${uid}`);
    }
    catch (error) {
        functions.logger.error(`Error cleaning up user ${uid}:`, error);
        throw error;
    }
});
/**
 * Callable: Process a payment (placeholder for Razorpay integration)
 */
exports.processPayment = functions.https.onCall(async (data, context) => {
    // Ensure user is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "User must be authenticated to process payment");
    }
    const { items, paymentMethod } = data;
    if (!items || !Array.isArray(items) || items.length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "Items array is required");
    }
    // TODO: Implement payment processing with Razorpay
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
exports.healthCheck = functions.https.onRequest((_req, res) => {
    res.status(200).json({
        status: "healthy",
        timestamp: new Date().toISOString(),
    });
});
// ── Subscription Triggers ──────────────────────────────────────────────────
var subscription_1 = require("./triggers/subscription");
Object.defineProperty(exports, "checkSubscriptionExpiry", { enumerable: true, get: function () { return subscription_1.checkSubscriptionExpiry; } });
// ── Usage Counter Triggers ─────────────────────────────────────────────────
var usage_1 = require("./triggers/usage");
Object.defineProperty(exports, "onQuizCreated", { enumerable: true, get: function () { return usage_1.onQuizCreated; } });
Object.defineProperty(exports, "onTestCreated", { enumerable: true, get: function () { return usage_1.onTestCreated; } });
Object.defineProperty(exports, "onContestCreated", { enumerable: true, get: function () { return usage_1.onContestCreated; } });
Object.defineProperty(exports, "onCourseCreated", { enumerable: true, get: function () { return usage_1.onCourseCreated; } });
Object.defineProperty(exports, "onQuestionCreated", { enumerable: true, get: function () { return usage_1.onQuestionCreated; } });
Object.defineProperty(exports, "onStudentEnrolled", { enumerable: true, get: function () { return usage_1.onStudentEnrolled; } });
// ── Revenue Tracking Triggers ──────────────────────────────────────────────
var revenue_1 = require("./triggers/revenue");
Object.defineProperty(exports, "onOrderCreated", { enumerable: true, get: function () { return revenue_1.onOrderCreated; } });
// ── Piston Job Queue Triggers ──────────────────────────────────────────────
var pistonQueue_1 = require("./triggers/pistonQueue");
Object.defineProperty(exports, "processPistonJob", { enumerable: true, get: function () { return pistonQueue_1.processPistonJob; } });
//# sourceMappingURL=index.js.map