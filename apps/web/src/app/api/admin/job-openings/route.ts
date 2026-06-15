import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/middleware/requireAdmin";
import { geocodeLocation, isRemoteLocation } from "@/lib/server/jobs/geocode";
import { JOB_OPENINGS } from "@/lib/server/jobs/sync";
import type { JobOpening } from "@digimine/types";

export const dynamic = "force-dynamic";

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const numOrNull = (v: unknown) => {
    if (v === "" || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : null;
};

/** POST — create an admin/internal job opening (geocoded server-side). */
export async function POST(req: NextRequest) {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;
    try {
        const body = await req.json().catch(() => ({}));
        const title = str(body.title, 160);
        const company = str(body.company, 120);
        const locationRaw = str(body.locationRaw, 160);
        const applyUrl = str(body.applyUrl, 600);
        if (!title || !company || !applyUrl) {
            return NextResponse.json({ error: "title, company and applyUrl are required." }, { status: 400 });
        }
        if (!/^https?:\/\//i.test(applyUrl)) {
            return NextResponse.json({ error: "applyUrl must be a valid http(s) link." }, { status: 400 });
        }

        const remote = Boolean(body.remote) || isRemoteLocation(locationRaw);
        const geo = await geocodeLocation(locationRaw);
        const now = new Date().toISOString();
        const ref = adminDb.collection(JOB_OPENINGS).doc();
        const salaryMin = numOrNull(body.salaryMin);
        const doc: JobOpening = {
            id: ref.id,
            source: "internal",
            externalId: null,
            title,
            company,
            companyLogo: str(body.companyLogo, 600) || null,
            location: {
                raw: locationRaw || (remote ? "Remote" : ""),
                city: geo.city,
                state: geo.state,
                country: geo.country,
                lat: geo.lat,
                lng: geo.lng,
            },
            remote,
            type: str(body.type, 40) || null,
            category: str(body.category, 60) || null,
            salaryMin,
            salaryMax: numOrNull(body.salaryMax),
            salaryCurrency: str(body.salaryCurrency, 8) || (salaryMin != null ? "INR" : null),
            descriptionSnippet: str(body.descriptionSnippet, 400),
            applyUrl,
            tags: Array.isArray(body.tags)
                ? body.tags.map((t: any) => String(t).trim()).filter(Boolean).slice(0, 8)
                : [],
            postedAt: now,
            expiresAt: str(body.expiresAt, 40) || null,
            createdAt: now,
            postedBy: auth.uid,
            featured: Boolean(body.featured),
        };
        await ref.set({ ...doc, active: true, syncedAt: Timestamp.now() });
        return NextResponse.json({ job: doc });
    } catch (e: any) {
        console.error("Create job opening failed:", e);
        return NextResponse.json({ error: e?.message || "Failed to create job opening" }, { status: 500 });
    }
}

/** GET — admin management list (includes inactive + raw fields). */
export async function GET(req: NextRequest) {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;
    try {
        const col = adminDb.collection(JOB_OPENINGS);
        let snap: FirebaseFirestore.QuerySnapshot;
        try {
            snap = await col.orderBy("syncedAt", "desc").limit(500).get();
        } catch {
            snap = await col.limit(500).get();
        }
        const jobs = snap.docs.map((d) => {
            const data = d.data() || {};
            return { ...data, id: d.id, syncedAt: data.syncedAt?.toMillis ? data.syncedAt.toMillis() : null };
        });
        return NextResponse.json({ jobs, total: jobs.length });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || "Failed to list job openings" }, { status: 500 });
    }
}

/** DELETE ?id= — remove an opening. */
export async function DELETE(req: NextRequest) {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;
    try {
        const id = new URL(req.url).searchParams.get("id");
        if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
        await adminDb.collection(JOB_OPENINGS).doc(id).delete();
        return NextResponse.json({ ok: true });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || "Failed to delete" }, { status: 500 });
    }
}
