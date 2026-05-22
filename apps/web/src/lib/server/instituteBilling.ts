import { Timestamp } from "firebase-admin/firestore";
import {
    INSTITUTE_BILLING_PLANS,
    getInstituteBillingPlan,
    type InstituteBillingPlanId,
    type InstituteBillingUsage,
} from "@digimine/types";
import { adminDb } from "@/lib/firebase/admin";
import { toIsoDate } from "@/lib/server/classroomAccess";

/**
 * Compute live usage by counting institute-owned resources. Cheap enough at
 * the institute scale we target — Firestore charges per doc read, and we
 * only sum collection-group counts that already exist in indexes.
 */
export async function computeInstituteUsage(instituteId: string): Promise<InstituteBillingUsage> {
    const [teachersSnap, classesSnap, questionBankSnap] = await Promise.all([
        adminDb
            .collection("institutes")
            .doc(instituteId)
            .collection("teachers")
            .where("status", "==", "active")
            .get(),
        adminDb.collection("classes").where("instituteId", "==", instituteId).get(),
        adminDb
            .collection("institutes")
            .doc(instituteId)
            .collection("questionBank")
            .get(),
    ]);

    // Centralized content count — quizzes/tests/contests/courses owned by
    // this institute. We tolerate missing collections silently.
    const contentBuckets = ["quizzes", "tests", "contests", "courses"] as const;
    const contentCounts = await Promise.all(
        contentBuckets.map(async (col) =>
            (await adminDb.collection(col).where("instituteId", "==", instituteId).get()).size
        )
    );
    const centralizedContent = contentCounts.reduce((sum, n) => sum + n, 0);

    // Student count rolls up class enrollments. We sum class.studentCount when
    // available, falling back to counting active members per class.
    let students = 0;
    for (const classDoc of classesSnap.docs) {
        const data = classDoc.data() || {};
        if (typeof data.studentCount === "number") {
            students += data.studentCount;
            continue;
        }
        const enrollSnap = await classDoc.ref
            .collection("students")
            .where("status", "==", "active")
            .get();
        students += enrollSnap.size;
    }

    return {
        teachers: teachersSnap.size,
        students,
        classes: classesSnap.size,
        questionBankItems: questionBankSnap.size,
        centralizedContent,
    };
}

export function resolveInstitutePlanId(institute: any): InstituteBillingPlanId {
    const id = institute?.subscription?.planId;
    if (id && id in INSTITUTE_BILLING_PLANS) return id as InstituteBillingPlanId;
    return "trial";
}

export function serializeInvoice(doc: any) {
    if (!doc) return null;
    const data = doc.data ? doc.data() : doc;
    if (!data) return null;
    return {
        id: doc.id || data.id,
        instituteId: data.instituteId || "",
        number: data.number || "",
        planId: data.planId || "trial",
        periodStart: toIsoDate(data.periodStart),
        periodEnd: toIsoDate(data.periodEnd),
        amountINR: Number(data.amountINR ?? 0),
        taxINR: Number(data.taxINR ?? 0),
        totalINR: Number(data.totalINR ?? 0),
        status: data.status || "issued",
        issuedAt: toIsoDate(data.issuedAt),
        dueAt: toIsoDate(data.dueAt),
        paidAt: toIsoDate(data.paidAt),
        pdfUrl: data.pdfUrl ?? null,
        notes: data.notes ?? null,
        createdAt: toIsoDate(data.createdAt),
        updatedAt: toIsoDate(data.updatedAt),
    };
}

export function serializePlanChangeRequest(doc: any) {
    if (!doc) return null;
    const data = doc.data ? doc.data() : doc;
    if (!data) return null;
    return {
        id: doc.id || data.id,
        instituteId: data.instituteId || "",
        requestedBy: data.requestedBy || "",
        requestedAt: toIsoDate(data.requestedAt),
        kind: data.kind || "upgrade",
        fromPlanId: data.fromPlanId ?? null,
        toPlanId: data.toPlanId ?? null,
        notes: data.notes ?? null,
        status: data.status || "pending",
        resolvedAt: toIsoDate(data.resolvedAt),
        resolvedBy: data.resolvedBy ?? null,
        resolutionNotes: data.resolutionNotes ?? null,
    };
}

export function nowTimestamp(): Timestamp {
    return Timestamp.now();
}

export function planSnapshot(planId: InstituteBillingPlanId) {
    return getInstituteBillingPlan(planId);
}
