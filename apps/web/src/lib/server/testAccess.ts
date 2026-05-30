/**
 * Server-side test-series purchase check.
 *
 * The Firestore security rules gate direct client reads of paid test content
 * via `hasPurchasedTest(seriesId)` (see firebase/firestore.rules). But the
 * test attempt routes read questions through the Admin SDK, which BYPASSES
 * those rules — so they must replicate the same ownership check, or a free
 * user could attempt/submit a paid catalogue series without buying it.
 *
 * Mirrors the rule exactly: owned iff the seriesId is in the user's
 * purchasedTestSeriesIds (or legacy purchasedTests), or there's an active
 * testPurchases/{uid_seriesId} record. Free enrolment + paid checkout both
 * write purchasedTestSeriesIds, so this covers both lanes.
 */
import { adminDb } from "@/lib/firebase/admin";

export async function userOwnsTestSeries(
    userId: string,
    seriesId: string
): Promise<boolean> {
    if (!userId || !seriesId) return false;

    const userSnap = await adminDb.collection("users").doc(userId).get();
    const u = userSnap.data() || {};
    const ids = Array.isArray(u.purchasedTestSeriesIds) ? u.purchasedTestSeriesIds : [];
    if (ids.includes(seriesId)) return true;
    const legacy = Array.isArray(u.purchasedTests) ? u.purchasedTests : [];
    if (legacy.includes(seriesId)) return true;

    const p = await adminDb.collection("testPurchases").doc(`${userId}_${seriesId}`).get();
    return p.exists && (p.data()?.status || "pending") === "active";
}

/**
 * True when this series is a public catalogue product (admin-authored, not
 * teacher/institute-owned and not a contest) whose paid content requires a
 * purchase. Teacher/institute series are gated by class enrolment, and
 * contests by the contest gate — those have their own checks upstream.
 */
export function isPaidCatalogSeries(series: {
    teacherId?: string | null;
    instituteId?: string | null;
    accessType?: string | null;
}): boolean {
    return (
        !series.teacherId &&
        !series.instituteId &&
        Boolean(series.accessType) &&
        series.accessType !== "free"
    );
}
