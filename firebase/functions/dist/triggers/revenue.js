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
exports.onOrderCreated = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
const TEACHER_SHARE = 0.7;
/**
 * Firestore trigger on orders collection
 * Track sales and earnings for teacher-published content
 */
exports.onOrderCreated = functions.firestore
    .document("orders/{orderId}")
    .onCreate(async (snap) => {
    const order = snap.data();
    if (!order.items || !Array.isArray(order.items))
        return;
    for (const item of order.items) {
        if (!item.teacherId || !item.contentId)
            continue;
        const contentRef = db.collection("public_content").doc(item.contentId);
        const contentSnap = await contentRef.get();
        if (!contentSnap.exists)
            continue;
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
//# sourceMappingURL=revenue.js.map