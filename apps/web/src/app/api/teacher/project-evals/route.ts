import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireTeacher } from "@/lib/middleware/requireTeacher";
import { getTeachingEntitlements, hasTeachingFeature } from "@/lib/server/teachingEntitlements";
import {
    PROJECT_EVALS,
    sanitizeParameters,
    serializeEvaluation,
} from "@/lib/server/projectEval/store";

export const dynamic = "force-dynamic";

/** List the teacher's project evaluations, newest first. */
export async function GET(req: NextRequest) {
    const auth = await requireTeacher(req);
    if (auth instanceof NextResponse) return auth;
    try {
        const snap = await adminDb
            .collection(PROJECT_EVALS)
            .where("teacherId", "==", auth.uid)
            .orderBy("createdAt", "desc")
            .limit(100)
            .get();
        return NextResponse.json({
            evaluations: snap.docs.map((d) => serializeEvaluation(d)),
        });
    } catch (error: any) {
        console.error("List project evals failed:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to list evaluations" },
            { status: 500 }
        );
    }
}

/** Create a project evaluation (draft by default). */
export async function POST(req: NextRequest) {
    const auth = await requireTeacher(req);
    if (auth instanceof NextResponse) return auth;
    try {
        // Plan gate: the AI project-evaluation teaching feature must be on.
        const ent = await getTeachingEntitlements(auth.uid);
        if (!ent.ok || !hasTeachingFeature(ent.resolved.teachingFeatures, "ai_project_evaluation")) {
            return NextResponse.json(
                {
                    error: "Your plan doesn't include AI project evaluation. Upgrade to unlock.",
                    upgradeHref: ent.ok && ent.resolved.scope === "institute"
                        ? "/pricing/institute"
                        : "/pricing/teacher",
                },
                { status: 403 }
            );
        }

        const body = await req.json().catch(() => ({}));
        const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
        const brief = typeof body.brief === "string" ? body.brief.trim().slice(0, 6000) : "";
        const techStack =
            typeof body.techStack === "string" && body.techStack.trim()
                ? body.techStack.trim().slice(0, 200)
                : null;
        const assignedMode = body.assignedMode === "all_students" ? "all_students" : "classes";
        const classIds = Array.isArray(body.classIds)
            ? body.classIds.filter((id: any) => typeof id === "string" && id).slice(0, 50)
            : [];
        const dueAt = body.dueAt ? new Date(body.dueAt) : null;
        const publish = body.status === "published";

        if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });
        if (!brief) {
            return NextResponse.json(
                { error: "Project brief is required — students and the AI both read it." },
                { status: 400 }
            );
        }
        if (assignedMode === "classes" && classIds.length === 0) {
            return NextResponse.json(
                { error: "Select at least one class, or assign to all students." },
                { status: 400 }
            );
        }
        if (dueAt && isNaN(dueAt.getTime())) {
            return NextResponse.json({ error: "Invalid due date." }, { status: 400 });
        }
        const parameters = sanitizeParameters(body.parameters);
        if ("error" in parameters) {
            return NextResponse.json({ error: parameters.error }, { status: 400 });
        }

        // Verify each class actually belongs to this teacher (or their institute).
        const instituteId =
            typeof auth.teacher?.instituteId === "string" && auth.teacher.instituteId
                ? auth.teacher.instituteId
                : null;
        for (const classId of classIds) {
            const c = await adminDb.collection("classes").doc(classId).get();
            const data = c.exists ? c.data() || {} : {};
            const ownClass = data.teacherId === auth.uid;
            const instituteClass = instituteId && data.instituteId === instituteId;
            if (!ownClass && !instituteClass) {
                return NextResponse.json(
                    { error: "One of the selected classes is not yours." },
                    { status: 403 }
                );
            }
        }

        const now = Timestamp.now();
        const ref = adminDb.collection(PROJECT_EVALS).doc();
        const data = {
            title,
            brief,
            techStack,
            parameters,
            maxTotalScore: parameters.reduce((sum, p) => sum + p.maxScore, 0),
            teacherId: auth.uid,
            instituteId,
            assignedMode,
            classIds,
            status: publish ? "published" : "draft",
            dueAt: dueAt ? Timestamp.fromDate(dueAt) : null,
            submissionCount: 0,
            evaluatedCount: 0,
            createdAt: now,
            updatedAt: now,
        };
        await ref.set(data);
        return NextResponse.json({ evaluation: serializeEvaluation({ id: ref.id, ...data }) });
    } catch (error: any) {
        console.error("Create project eval failed:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to create evaluation" },
            { status: 500 }
        );
    }
}
