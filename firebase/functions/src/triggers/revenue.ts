import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();
const TEACHER_SHARE = 0.7;

/**
 * Firestore trigger on orders collection
 * Track sales and earnings for teacher-published content
 */
export const onOrderCreated = functions.firestore
    .document("orders/{orderId}")
    .onCreate(async (snap) => {
        const order = snap.data();
        if (!order.items || !Array.isArray(order.items)) return;

        for (const item of order.items) {
            if (!item.teacherId || !item.contentId) continue;

            const contentRef = db.collection("public_content").doc(item.contentId);
            const contentSnap = await contentRef.get();
            if (!contentSnap.exists) continue;

            const revenue = item.price || 0;
            const teacherEarnings = Math.round(revenue * TEACHER_SHARE * 100) / 100;

            // Update public content stats
            await contentRef.update({
                salesCount: admin.firestore.FieldValue.increment(1),
                revenueGenerated: admin.firestore.FieldValue.increment(revenue),
                teacherEarnings: admin.firestore.FieldValue.increment(teacherEarnings),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // Update teacher earnings
            const teacherRef = db.collection("teachers").doc(item.teacherId);
            await teacherRef.update({
                "usage.totalEarnings": admin.firestore.FieldValue.increment(teacherEarnings),
                "usage.pendingPayout": admin.firestore.FieldValue.increment(teacherEarnings),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }
    });
