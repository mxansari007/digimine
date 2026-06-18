/**
 * Slug availability + reservation for slug-keyed catalog content
 * (quizzes / tests / courses / contests).
 *
 * Why this exists on the SERVER: these collections are owner-gated — the read
 * rule references `resource.data.teacherId`, so a client `getDoc` on a slug
 * that DOESN'T exist evaluates the rule against a null `resource` and returns
 * `permission-denied`, indistinguishable from "exists but not mine". The old
 * client check treated that as "taken", so every brand-new slug looked taken.
 * The admin SDK bypasses rules, so `.exists` here is the definitive answer.
 */
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireVerifiedUser } from "@/lib/server/classroomAccess";
import { isValidSlug } from "@digimine/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLUG_COLLECTIONS = new Set(["quizzes", "tests", "courses", "contests"]);
const MAX_ATTEMPTS = 50;

export async function POST(req: Request) {
    const auth = await requireVerifiedUser(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = (await req.json().catch(() => ({}))) as {
        collection?: string;
        slug?: string;
        excludeId?: string;
    };
    const collection = typeof body.collection === "string" ? body.collection : "";
    const slug = (typeof body.slug === "string" ? body.slug : "").trim();
    const excludeId = typeof body.excludeId === "string" ? body.excludeId : undefined;

    if (!SLUG_COLLECTIONS.has(collection)) {
        return NextResponse.json({ error: "Unknown content type." }, { status: 400 });
    }
    if (!slug) {
        return NextResponse.json({ error: "A slug is required." }, { status: 400 });
    }
    if (!isValidSlug(slug)) {
        return NextResponse.json(
            { error: "Slug can only contain lowercase letters, numbers, and single hyphens." },
            { status: 400 }
        );
    }
    // Editing without changing the slug — nothing to reserve.
    if (excludeId && slug === excludeId) {
        return NextResponse.json({ slug });
    }

    let candidate = slug;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (excludeId && candidate === excludeId) {
            return NextResponse.json({ slug: candidate });
        }
        const snap = await adminDb.collection(collection).doc(candidate).get();
        if (!snap.exists) {
            return NextResponse.json({ slug: candidate });
        }
        candidate = `${slug}-${attempt + 2}`; // first collision → "<slug>-2"
    }

    return NextResponse.json(
        { error: `Could not find a free slug for "${slug}". Please choose a different one.` },
        { status: 409 }
    );
}
