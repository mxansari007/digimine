import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { assertInstituteAdmin } from "@/lib/server/institutes";
import { toIsoDate } from "@/lib/server/classroomAccess";
import { getTeachingEntitlements } from "@/lib/server/teachingEntitlements";
import { isValidSlug, slugify } from "@digimine/utils";
import type { TeachingLimits } from "@digimine/types";

export const dynamic = "force-dynamic";

const TYPE_COLLECTION: Record<string, string> = {
    quiz: "quizzes",
    test: "tests",
    contest: "contests",
    course: "courses",
};

/** Plan limit governing each content collection. */
const LIMIT_KEY_BY_COLLECTION: Record<string, keyof TeachingLimits> = {
    quizzes: "maxQuizzes",
    tests: "maxTests",
    contests: "maxContests",
    courses: "maxCourses",
};

const COLLECTION_KIND: Record<string, "quiz" | "test" | "contest" | "course"> = {
    quizzes: "quiz",
    tests: "test",
    contests: "contest",
    courses: "course",
};

/**
 * Aggregated list of every piece of content authored by the institute (i.e.
 * `instituteId == X`). Includes a tab filter via ?type=quiz|test|contest|course.
 */
export async function GET(req: Request, { params }: { params: { instituteId: string } }) {
    try {
        const auth = await assertInstituteAdmin(req, params.instituteId);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

        const { searchParams } = new URL(req.url);
        const type = (searchParams.get("type") || "all").toLowerCase();
        const collections = type in TYPE_COLLECTION ? [TYPE_COLLECTION[type]] : Object.values(TYPE_COLLECTION);

        const results: Array<any> = [];
        await Promise.all(
            collections.map(async (col) => {
                const snap = await adminDb
                    .collection(col)
                    .where("instituteId", "==", params.instituteId)
                    .get();
                snap.docs.forEach((d) => {
                    const data = d.data() || {};
                    results.push({
                        id: d.id,
                        collection: col,
                        kind: COLLECTION_KIND[col],
                        title: data.title || data.name || "Untitled",
                        slug: data.slug || d.id,
                        status: data.status || "draft",
                        visibility: data.visibility || "private",
                        classIds: Array.isArray(data.classIds) ? data.classIds : [],
                        teacherId: data.teacherId || "",
                        createdAt: toIsoDate(data.createdAt),
                        updatedAt: toIsoDate(data.updatedAt),
                    });
                });
            })
        );

        results.sort((a, b) => {
            const aT = a.createdAt ? Date.parse(a.createdAt) : 0;
            const bT = b.createdAt ? Date.parse(b.createdAt) : 0;
            return bT - aT;
        });

        return NextResponse.json({ items: results });
    } catch (error: any) {
        console.error("Institute content list failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}

/**
 * Skeleton creator — the institute admin uses the existing teacher authoring
 * flows for the heavy lifting (questions, sections, schedule). This endpoint
 * just creates the parent doc with `instituteId` stamped + `classIds` set.
 *
 * Body: { type, title, description?, classIds?, ...typeSpecific }
 */
export async function POST(req: Request, { params }: { params: { instituteId: string } }) {
    try {
        const auth = await assertInstituteAdmin(req, params.instituteId);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

        const body = await req.json().catch(() => ({}));
        const type = typeof body.type === "string" ? body.type : "";
        const col = TYPE_COLLECTION[type];
        if (!col) return NextResponse.json({ error: "Invalid type" }, { status: 400 });

        const title = typeof body.title === "string" ? body.title.trim() : "";
        if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 });

        const description = typeof body.description === "string" ? body.description.trim() : "";
        const classIds: string[] = Array.isArray(body.classIds)
            ? body.classIds.filter((id: any) => typeof id === "string" && id.length > 0)
            : [];

        // Validate the target classes are owned by this institute.
        for (const cid of classIds) {
            const cls = await adminDb.collection("classes").doc(cid).get();
            if (!cls.exists || (cls.data() || {}).instituteId !== params.instituteId) {
                return NextResponse.json(
                    { error: `Class ${cid} doesn't belong to this institute` },
                    { status: 400 }
                );
            }
        }

        // Enforce the institute plan's content limit (authored in the admin
        // plan maker) before creating: count the institute's existing docs of
        // this type and deny once the cap is reached. -1 / missing = unlimited.
        const entitlements = await getTeachingEntitlements(auth.userId);
        if (entitlements.ok) {
            const limitKey = LIMIT_KEY_BY_COLLECTION[col];
            const max = limitKey ? entitlements.resolved.teachingLimits[limitKey] : -1;
            if (typeof max === "number" && max >= 0) {
                const agg = await adminDb
                    .collection(col)
                    .where("instituteId", "==", params.instituteId)
                    .count()
                    .get();
                if (agg.data().count >= max) {
                    return NextResponse.json(
                        {
                            error: `Your current plan allows up to ${max} ${col}. Upgrade your plan to create more.`,
                            code: "plan_limit_reached",
                        },
                        { status: 403 }
                    );
                }
            }
        }

        // Normalise through the canonical slugifier (handles a raw client
        // value as well as the title fallback), then assert it's well-formed.
        const slug = slugify(typeof body.slug === "string" && body.slug.trim() ? body.slug : title);
        if (!isValidSlug(slug)) {
            return NextResponse.json(
                {
                    error:
                        "Slug can only contain lowercase letters, numbers, and single hyphens.",
                },
                { status: 400 }
            );
        }
        // Every content type is keyed by its slug so the catalog can address it
        // by slug and a duplicate can't be created twice. `.create()` is atomic
        // and fails if the document already exists — this also closes the hole
        // where a raw client slug could overwrite an existing (even platform)
        // document via the admin SDK.
        const ref = adminDb.collection(col).doc(slug);
        const now = Timestamp.now();

        const baseData: Record<string, any> = {
            title,
            slug,
            description: description || "",
            // The author is the institute admin; the institute owns the content.
            teacherId: "",
            instituteId: params.instituteId,
            classIds,
            visibility: "private",
            reviewStatus: "draft",
            status: "draft",          // teachers/admin still need to "publish" before students see it
            isDeleted: false,
            context: "institute",
            createdBy: auth.userId,
            createdAt: now,
            updatedAt: now,
        };

        // Type-specific defaults (kept minimal — the editor fills in the rest).
        if (type === "quiz") {
            baseData.timeLimitMinutes = body.timeLimitMinutes || 0;
            baseData.passingPercentage = body.passingPercentage || 0;
            baseData.shuffleQuestions = Boolean(body.shuffleQuestions);
            baseData.shuffleOptions = Boolean(body.shuffleOptions);
            baseData.showExplanations = body.showExplanations !== false;
            baseData.totalQuestions = 0;
            baseData.totalMarks = 0;
        } else if (type === "test") {
            baseData.duration = body.duration || 60;
            baseData.totalMarks = 0;
            baseData.totalQuestions = 0;
            baseData.totalTests = 0;
            baseData.allowRetake = Boolean(body.allowRetake);
            baseData.instantResults = body.instantResults !== false;
        } else if (type === "contest") {
            baseData.startTime = body.startTime ? new Date(body.startTime) : now.toDate();
            baseData.endTime = body.endTime ? new Date(body.endTime) : now.toDate();
        } else if (type === "course") {
            baseData.estimatedHours = body.estimatedHours || 0;
            baseData.difficulty = body.difficulty || "beginner";
            baseData.accessType = body.accessType || "free";
        }

        try {
            // `.create()` (not `.set()`) fails if the slug is already taken,
            // so we never silently overwrite an existing document.
            await ref.create(baseData);
        } catch (err: any) {
            // Firestore ALREADY_EXISTS = gRPC code 6.
            if (err?.code === 6 || /already exists/i.test(err?.message || "")) {
                return NextResponse.json(
                    {
                        error: `The slug "${slug}" is already taken. Please choose a different slug.`,
                        code: "slug_taken",
                    },
                    { status: 409 }
                );
            }
            throw err;
        }
        return NextResponse.json({
            id: ref.id,
            kind: type,
            collection: col,
            ...baseData,
            createdAt: now.toDate().toISOString(),
            updatedAt: now.toDate().toISOString(),
        });
    } catch (error: any) {
        console.error("Institute content create failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
