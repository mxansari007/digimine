import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

/**
 * Scheduled function: Check subscription expiry every 6 hours
 * - active → grace_period when expiresAt is past
 * - grace_period → expired when gracePeriodEndsAt is past
 * - expired → downgrade to free plan
 */
export const checkSubscriptionExpiry = functions.pubsub
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
            const gracePeriodEndsAt = admin.firestore.Timestamp.fromDate(
                new Date(now.toDate().getTime() + 7 * 24 * 60 * 60 * 1000)
            );
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
