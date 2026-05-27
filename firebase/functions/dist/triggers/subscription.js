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
exports.checkSubscriptionExpiry = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
/**
 * Scheduled function: Check subscription expiry every 6 hours
 * - active → grace_period when expiresAt is past
 * - grace_period → expired when gracePeriodEndsAt is past
 * - expired → downgrade to free plan
 */
exports.checkSubscriptionExpiry = functions.pubsub
    .schedule("0 */6 * * *")
    .timeZone("Asia/Kolkata")
    .onRun(async () => {
    const now = admin.firestore.Timestamp.now();
    // 1. Find teachers whose active subscription has expired
    const expiredActiveSnap = await db
        .collection("teachers")
        .where("subscription.status", "==", "active")
        .where("subscription.expiresAt", "<", now)
        .get();
    const batch1 = db.batch();
    for (const doc of expiredActiveSnap.docs) {
        const gracePeriodEndsAt = admin.firestore.Timestamp.fromDate(new Date(now.toDate().getTime() + 7 * 24 * 60 * 60 * 1000));
        batch1.update(doc.ref, {
            "subscription.status": "grace_period",
            "subscription.gracePeriodEndsAt": gracePeriodEndsAt,
            updatedAt: now,
        });
    }
    await batch1.commit();
    functions.logger.info(`Updated ${expiredActiveSnap.size} teachers to grace_period`);
    // 2. Find teachers whose grace period has ended
    const expiredGraceSnap = await db
        .collection("teachers")
        .where("subscription.status", "==", "grace_period")
        .where("subscription.gracePeriodEndsAt", "<", now)
        .get();
    const batch2 = db.batch();
    for (const doc of expiredGraceSnap.docs) {
        batch2.update(doc.ref, {
            "subscription.status": "expired",
            "subscription.planId": "free",
            "subscription.autoRenew": false,
            updatedAt: now,
        });
    }
    await batch2.commit();
    functions.logger.info(`Downgraded ${expiredGraceSnap.size} teachers to free plan`);
    return null;
});
//# sourceMappingURL=subscription.js.map