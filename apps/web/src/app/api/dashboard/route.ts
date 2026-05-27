import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId } from "@/lib/server/classroomAccess";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        // Require a bearer token. The legacy `?userId=` param is still
        // accepted but MUST match the token's uid — pre-fix, any caller
        // could read any user's orders + purchasedProducts by guessing a
        // uid (no auth at all).
        const tokenUserId = await getBearerUserId(req).catch(() => null);
        if (!tokenUserId) {
            return NextResponse.json({ error: "Sign in" }, { status: 401 });
        }
        const { searchParams } = new URL(req.url);
        const queryUserId = searchParams.get("userId");
        if (queryUserId && queryUserId !== tokenUserId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const userId = tokenUserId;

        const result: Record<string, any> = {};

        // ── Orders ────────────────────────────────────────────────────────
        try {
            const ordersSnap = await adminDb
                .collection("orders")
                .where("userId", "==", userId)
                .get();

            const orderDocs = ordersSnap.docs
                .map((d) => {
                    const data = d.data();
                    return {
                        id: d.id,
                        ...data,
                        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null,
                        updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || null,
                    };
                })
                .sort((a: any, b: any) => {
                    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                    return bTime - aTime;
                })
                .slice(0, 20);

            result.orders = orderDocs;
        } catch {
            result.orders = [];
        }

        // ── Products ──────────────────────────────────────────────────────
        try {
            const userSnap = await adminDb.collection("users").doc(userId).get();
            const userData = userSnap.data();
            const purchasedItems = userData?.purchasedProducts || [];
            const productIds = Array.from(
                new Set(purchasedItems.map((p: any) => (typeof p === "string" ? p : p.productId)).filter(Boolean))
            ) as string[];

            const products: any[] = [];
            if (productIds.length > 0) {
                for (const pid of productIds.slice(0, 50)) {
                    try {
                        const pSnap = await adminDb.collection("products").doc(pid).get();
                        if (pSnap.exists) {
                            const pData = pSnap.data();
                            if (!pData) continue;
                            products.push({
                                id: pSnap.id,
                                ...pData,
                                createdAt: pData.createdAt?.toDate?.()?.toISOString?.() || null,
                            });
                        }
                    } catch {
                        // skip broken refs
                    }
                }
            }
            result.products = products;
        } catch {
            result.products = [];
        }

        // ── Test Series Purchases ─────────────────────────────────────────
        try {
            const tpSnap = await adminDb
                .collection("testPurchases")
                .where("userId", "==", userId)
                .get();

            const seriesIds = [...new Set(tpSnap.docs
                .filter((d) => d.data().status === "active")
                .map((d) => d.data().testId || d.data().seriesId)
                .filter(Boolean))] as string[];
            const seriesList: any[] = [];

            for (const sid of seriesIds) {
                try {
                    const sSnap = await adminDb.collection("tests").doc(sid).get();
                    if (sSnap.exists) {
                        const sData = sSnap.data();
                        if (!sData) continue;
                        seriesList.push({
                            id: sSnap.id,
                            ...sData,
                            createdAt: sData.createdAt?.toDate?.()?.toISOString?.() || null,
                        });
                    }
                } catch {
                    // skip
                }
            }
            result.purchasedSeries = seriesList;
        } catch {
            result.purchasedSeries = [];
        }

        // ── Active Test Attempt ───────────────────────────────────────────
        //
        // The "Resume Test" banner should only show while the student has an
        // attempt that is **truly still resumable**:
        //   - status is `in_progress` (not completed / timed_out / abandoned)
        //   - endTime is still in the future (timer hasn't expired)
        //
        // If we find an attempt that is `in_progress` but whose endTime has
        // already passed, we flip it to `timed_out` on the spot so it stops
        // haunting the library page. This handles the case where the
        // student's browser was closed before the auto-submit could fire.
        try {
            const toMillis = (val: any): number => {
                if (!val) return 0;
                if (val instanceof Date) return val.getTime();
                if (typeof val.toMillis === "function") return val.toMillis();
                if (typeof val.toDate === "function") return val.toDate().getTime();
                if (typeof val.seconds === "number") return val.seconds * 1000;
                if (typeof val === "string" || typeof val === "number") {
                    const parsed = new Date(val).getTime();
                    return Number.isFinite(parsed) ? parsed : 0;
                }
                return 0;
            };

            const attSnap = await adminDb
                .collection("testAttempts")
                .where("userId", "==", userId)
                .where("status", "==", "in_progress")
                .get();

            const now = Date.now();
            const candidates = attSnap.docs
                .map((d) => ({ ref: d.ref, id: d.id, data: d.data() }))
                .sort((a, b) => toMillis(b.data.startedAt) - toMillis(a.data.startedAt));

            let active: typeof candidates[number] | null = null;
            for (const candidate of candidates) {
                const endMs = toMillis(candidate.data.endTime);
                if (endMs > 0 && endMs <= now) {
                    // Timer ran out and the client never finalised. Mark it
                    // timed_out so the banner stops showing on the next load.
                    // Best-effort: ignore errors so one bad doc doesn't break
                    // the whole dashboard.
                    try {
                        await candidate.ref.update({
                            status: "timed_out",
                            updatedAt: new Date(),
                            remainingTime: 0,
                        });
                    } catch {
                        /* non-critical */
                    }
                    continue;
                }
                active = candidate;
                break;
            }

            if (active) {
                const attData = active.data;
                const seriesId = attData.seriesId;
                let series = null;
                let isTeacherSeries = false;
                if (seriesId) {
                    const sSnap = await adminDb.collection("tests").doc(seriesId).get();
                    if (sSnap.exists) {
                        const sData = sSnap.data();
                        if (sData) {
                            // Teacher-classroom test series don't belong on
                            // the public Resume-Test banner — they resume via
                            // the classroom flow, not the public /tests/...
                            // URL. Suppress the banner for those entirely.
                            isTeacherSeries = Boolean(sData.teacherId);
                            series = {
                                id: sSnap.id,
                                slug: sData.slug || sSnap.id,
                                title: sData.title || "",
                                duration: sData.duration || 0,
                            };
                        }
                    }
                }
                result.activeAttempt = isTeacherSeries
                    ? null
                    : {
                          attempt: {
                              id: active.id,
                              ...attData,
                              startedAt: attData.startedAt?.toDate?.()?.toISOString?.() || null,
                              endTime: attData.endTime?.toDate?.()?.toISOString?.() || null,
                          },
                          series,
                      };
            } else {
                result.activeAttempt = null;
            }
        } catch {
            result.activeAttempt = null;
        }

        // ── Enrolled Classrooms with Backfill ─────────────────────────────
        try {
            const userSnap = await adminDb.collection("users").doc(userId).get();
            const userData = userSnap.data();
            let enrolledIds: string[] = userData?.enrolledClassrooms || [];

            // Backfill: if enrolledClassrooms is empty/undefined, scan teacher_enrollments
            if (enrolledIds.length === 0) {
                const teachersSnap = await adminDb.collection("teacher_enrollments").get();
                const foundIds: string[] = [];

                for (const teacherDoc of teachersSnap.docs) {
                    try {
                        const enrollSnap = await adminDb
                            .collection("teacher_enrollments")
                            .doc(teacherDoc.id)
                            .collection("students")
                            .doc(userId)
                            .get();

                        if (enrollSnap.exists && enrollSnap.data()?.status === "active") {
                            foundIds.push(teacherDoc.id);
                        }
                    } catch {
                        // skip
                    }
                }

                if (foundIds.length > 0) {
                    // Write backfilled ids to user doc
                    await adminDb.collection("users").doc(userId).update({
                        enrolledClassrooms: foundIds,
                        updatedAt: new Date(),
                    }).catch(() => {});
                    enrolledIds = foundIds;
                }
            }

            // Load teacher details
            const classrooms: any[] = [];
            for (const tid of enrolledIds) {
                try {
                    const tSnap = await adminDb.collection("teachers").doc(tid).get();
                    if (tSnap.exists) {
                        const tData = tSnap.data();
                        classrooms.push({
                            teacherId: tid,
                            teacherName: tData?.profile?.name || "Unknown Teacher",
                            teacherAvatar: tData?.profile?.avatarUrl || null,
                            teacherInstitute: tData?.profile?.institute || "",
                            inviteCode: tData?.inviteCode || "",
                        });
                    }
                } catch {
                    // skip
                }
            }
            result.classrooms = classrooms;
        } catch {
            result.classrooms = [];
        }

        return NextResponse.json(result);
    } catch (error: any) {
        console.error("Dashboard API error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to load dashboard" },
            { status: 500 }
        );
    }
}
