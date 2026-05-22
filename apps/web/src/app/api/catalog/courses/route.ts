import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { toIsoDate } from "@/lib/server/classroomAccess";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function fetchCatalog() {
    const collection = adminDb.collection("courses");

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

    return Array.from(byId.values())
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
            difficulty: data.difficulty || "beginner",
            estimatedHours: typeof data.estimatedHours === "number" ? data.estimatedHours : 0,
            notesOutline: data.notesOutline || null,
            notesSummary: data.notesSummary || null,
            linkedTestSeriesIds: Array.isArray(data.linkedTestSeriesIds) ? data.linkedTestSeriesIds : [],
            linkedQuizzes: Array.isArray(data.linkedQuizzes) ? data.linkedQuizzes : [],
            status: data.status || "draft",
            teacherId: data.teacherId || "",
            visibility: data.visibility || "public",
            isDeleted: data.isDeleted || false,
            createdAt: toIsoDate(data.createdAt),
            updatedAt: toIsoDate(data.updatedAt),
            createdBy: data.createdBy || null,
        }))
        .sort((a, b) => {
            const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
            const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
            return bTime - aTime;
        });
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const slug = searchParams.get("slug");

        if (slug) {
            const direct = await adminDb.collection("courses").doc(slug).get();
            const candidates: FirebaseFirestore.DocumentData[] = [];
            if (direct.exists) {
                candidates.push({ id: direct.id, ...(direct.data() || {}) });
            } else {
                const snap = await adminDb
                    .collection("courses")
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
            if (!match) return NextResponse.json({ course: null });
            return NextResponse.json({
                course: {
                    ...match,
                    createdAt: toIsoDate(match.createdAt),
                    updatedAt: toIsoDate(match.updatedAt),
                },
            });
        }

        const items = await fetchCatalog();
        return NextResponse.json({ items });
    } catch (error: any) {
        console.error("Course catalog error:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to load courses", items: [] },
            { status: 500 }
        );
    }
}
