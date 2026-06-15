import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { JOB_OPENINGS } from "@/lib/server/jobs/sync";
import type { JobOpening } from "@digimine/types";

export const dynamic = "force-dynamic";

const CAP = 1500;

function serialize(d: FirebaseFirestore.QueryDocumentSnapshot): JobOpening {
    const x = d.data() || {};
    const loc = x.location || {};
    return {
        id: d.id,
        source: x.source || "internal",
        externalId: x.externalId ?? null,
        title: x.title || "Untitled role",
        company: x.company || "Company",
        companyLogo: x.companyLogo ?? null,
        location: {
            raw: loc.raw || "",
            city: loc.city ?? null,
            state: loc.state ?? null,
            country: loc.country ?? null,
            lat: typeof loc.lat === "number" ? loc.lat : null,
            lng: typeof loc.lng === "number" ? loc.lng : null,
        },
        remote: Boolean(x.remote),
        type: x.type ?? null,
        category: x.category ?? null,
        salaryMin: x.salaryMin ?? null,
        salaryMax: x.salaryMax ?? null,
        salaryCurrency: x.salaryCurrency ?? null,
        descriptionSnippet: x.descriptionSnippet || "",
        applyUrl: x.applyUrl || "",
        tags: Array.isArray(x.tags) ? x.tags : [],
        postedAt: x.postedAt ?? null,
        expiresAt: x.expiresAt ?? null,
        createdAt: x.createdAt || "",
        postedBy: x.postedBy ?? null,
        featured: Boolean(x.featured),
    };
}

/**
 * Student-facing job feed for the map. Returns the latest active openings; the
 * map clusters/filters by viewport client-side (Firestore has no native geo
 * query, so we cap + filter in-memory — fine at this volume).
 */
export async function GET(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const q = (searchParams.get("q") || "").toLowerCase().trim();
        const type = (searchParams.get("type") || "").toLowerCase().trim();
        const category = (searchParams.get("category") || "").toLowerCase().trim();
        const source = (searchParams.get("source") || "").toLowerCase().trim();
        const remoteOnly = searchParams.get("remote") === "1";

        const col = adminDb.collection(JOB_OPENINGS);
        let snap: FirebaseFirestore.QuerySnapshot;
        try {
            snap = await col.where("active", "==", true).orderBy("syncedAt", "desc").limit(CAP).get();
        } catch {
            // Composite index (active + syncedAt) not built yet, or only internal
            // jobs exist — fall back to an unordered active query.
            snap = await col.where("active", "==", true).limit(CAP).get();
        }

        let jobs = snap.docs.map(serialize);
        if (remoteOnly) jobs = jobs.filter((j) => j.remote);
        if (type) jobs = jobs.filter((j) => (j.type || "").toLowerCase().includes(type));
        if (category) jobs = jobs.filter((j) => (j.category || "").toLowerCase().includes(category));
        if (source) jobs = jobs.filter((j) => j.source === source);
        if (q) {
            jobs = jobs.filter(
                (j) =>
                    j.title.toLowerCase().includes(q) ||
                    j.company.toLowerCase().includes(q) ||
                    (j.location.city || "").toLowerCase().includes(q) ||
                    (j.location.raw || "").toLowerCase().includes(q) ||
                    j.tags.some((t) => t.toLowerCase().includes(q))
            );
        }

        const cities = new Set<string>();
        for (const j of jobs) if (j.location.city) cities.add(j.location.city);

        return NextResponse.json({
            jobs,
            total: jobs.length,
            mapped: jobs.filter((j) => j.location.lat != null).length,
            remote: jobs.filter((j) => j.remote).length,
            cities: cities.size,
        });
    } catch (error: any) {
        console.error("List job openings failed:", error);
        return NextResponse.json({ error: error?.message || "Failed to load jobs" }, { status: 500 });
    }
}
