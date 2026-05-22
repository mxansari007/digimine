import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { toIsoDate } from "@/lib/server/classroomAccess";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Filters = { category?: string };

/**
 * Public test-series catalog. Uses the admin SDK so we don't depend on
 * Firestore security rules or every doc having `teacherId: ""` written
 * explicitly. Returns:
 *   - Admin-authored content (no teacherId, or teacherId == "")
 *   - Teacher-authored content the admin has approved for the marketplace
 *     (visibility in ['published', 'public'])
 * Classroom-only teacher content is always excluded.
 */
async function fetchCatalog(filters: Filters) {
    const collection = adminDb.collection("tests");

    // We do two narrow queries here too because firestore queries can't OR
    // `teacherId == ""` with `visibility in [...]` cheaply. The merge happens
    // in JS.
    const [adminSnap, approvedTeacherSnap] = await Promise.all([
        collection
            .where("status", "==", "published")
            .get()
            .catch(() => ({ docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] })),
        collection
            .where("visibility", "==", "published")
            .where("status", "==", "published")
            .get()
            .catch(() => ({ docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] })),
    ]);

    const byId = new Map<string, FirebaseFirestore.DocumentData>();

    for (const doc of adminSnap.docs) {
        const data = doc.data() || {};
        // Admin docs have no teacherId or teacherId === "". Teacher classroom
        // content that happens to match `status: published` is filtered out
        // here — that's what makes this safe.
        const teacherId = typeof data.teacherId === "string" ? data.teacherId : "";
        if (teacherId !== "") continue;
        if (data.isDeleted === true) continue;
        byId.set(doc.id, { id: doc.id, ...data });
    }
    for (const doc of approvedTeacherSnap.docs) {
        const data = doc.data() || {};
        if (data.isDeleted === true) continue;
        byId.set(doc.id, { id: doc.id, ...data });
    }

    const results = Array.from(byId.values())
        .map((data) => ({
            id: data.id,
            slug: data.slug || data.id,
            title: data.title || "Untitled",
            description: data.description || "",
            shortDescription: data.shortDescription || data.description?.slice(0, 200) || "",
            thumbnailURL: data.thumbnailURL || null,
            price: typeof data.price === "number" ? data.price : 0,
            compareAtPrice: typeof data.compareAtPrice === "number" ? data.compareAtPrice : null,
            accessType: data.accessType || "free",
            category: data.category || "",
            tags: Array.isArray(data.tags) ? data.tags : [],
            highlights: Array.isArray(data.highlights) ? data.highlights : [],
            totalTests: typeof data.totalTests === "number" ? data.totalTests : 0,
            totalQuestions: typeof data.totalQuestions === "number" ? data.totalQuestions : 0,
            totalMarks: typeof data.totalMarks === "number" ? data.totalMarks : 0,
            duration: typeof data.duration === "number" ? data.duration : 0,
            status: data.status || "draft",
            teacherId: data.teacherId || "",
            visibility: data.visibility || "public",
            isDeleted: data.isDeleted || false,
            createdAt: toIsoDate(data.createdAt),
            updatedAt: toIsoDate(data.updatedAt),
            createdBy: data.createdBy || null,
        }))
        .filter((s) => !filters.category || s.category === filters.category)
        .sort((a, b) => {
            const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
            const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
            return bTime - aTime;
        });

    return results;
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const slug = searchParams.get("slug");
        const category = searchParams.get("category") || undefined;

        if (slug) {
            // Single-doc lookup — first by ID, then by slug field.
            const direct = await adminDb.collection("tests").doc(slug).get();
            const candidates: FirebaseFirestore.DocumentData[] = [];
            if (direct.exists) {
                candidates.push({ id: direct.id, ...(direct.data() || {}) });
            } else {
                const snap = await adminDb
                    .collection("tests")
                    .where("slug", "==", slug)
                    .limit(2)
                    .get();
                snap.docs.forEach((d) => candidates.push({ id: d.id, ...(d.data() || {}) }));
            }
            const match = candidates.find((data) => {
                if (data.status !== "published") return false;
                if (data.isDeleted === true) return false;
                const teacherId = typeof data.teacherId === "string" ? data.teacherId : "";
                if (teacherId === "") return true;
                return data.visibility === "published" || data.visibility === "public";
            });
            if (!match) return NextResponse.json({ series: null });
            return NextResponse.json({
                series: {
                    ...match,
                    createdAt: toIsoDate(match.createdAt),
                    updatedAt: toIsoDate(match.updatedAt),
                },
            });
        }

        const items = await fetchCatalog({ category });
        return NextResponse.json({ items });
    } catch (error: any) {
        console.error("Test catalog error:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to load tests", items: [] },
            { status: 500 }
        );
    }
}
