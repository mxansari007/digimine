import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireVerifiedUser } from "@/lib/server/classroomAccess";
import { parseGitHubUrl } from "@/lib/server/projectEval/github";
import {
    PROJECT_EVALS,
    PROJECT_SUBMISSIONS,
    getEvaluationById,
    serializeSubmission,
    studentCanAccessEvaluation,
    submissionDocId,
} from "@/lib/server/projectEval/store";

export const dynamic = "force-dynamic";

/**
 * Student submits (or resubmits) a public GitHub repo for evaluation.
 * Creates/overwrites `projectSubmissions/{evalId_uid}` with status
 * "queued"; the client then fire-and-forgets POST /api/project-eval/process
 * which performs the actual analysis in its own invocation.
 */
export async function POST(req: Request, { params }: { params: { evalId: string } }) {
    try {
        const auth = await requireVerifiedUser(req);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status });
        }
        const userId = auth.userId;

        const evalData = await getEvaluationById(params.evalId);
        if (!evalData) {
            return NextResponse.json({ error: "Evaluation not found." }, { status: 404 });
        }
        if (evalData.status !== "published") {
            return NextResponse.json(
                { error: "This evaluation is not accepting submissions." },
                { status: 409 }
            );
        }
        if (!(await studentCanAccessEvaluation(evalData, userId))) {
            return NextResponse.json({ error: "Evaluation not found." }, { status: 404 });
        }
        const dueAtMs = evalData.dueAt?.toMillis?.() ?? null;
        if (dueAtMs && Date.now() > dueAtMs) {
            return NextResponse.json(
                { error: "The due date for this evaluation has passed." },
                { status: 409 }
            );
        }

        const body = await req.json().catch(() => ({}));
        const repoUrl = typeof body.repoUrl === "string" ? body.repoUrl.trim() : "";
        const parsed = parseGitHubUrl(repoUrl);
        if (!parsed) {
            return NextResponse.json(
                {
                    error: "Enter a valid public GitHub repository URL, e.g. https://github.com/you/my-project",
                },
                { status: 400 }
            );
        }

        const userSnap = await adminDb.collection("users").doc(userId).get();
        const userData = userSnap.exists ? userSnap.data() || {} : {};

        const ref = adminDb.collection(PROJECT_SUBMISSIONS).doc(submissionDocId(params.evalId, userId));
        const prevSnap = await ref.get();
        const prev = prevSnap.exists ? prevSnap.data() || {} : null;
        if (prev?.status === "processing") {
            return NextResponse.json(
                { error: "Your previous submission is still being evaluated — wait for it to finish." },
                { status: 409 }
            );
        }

        const now = Timestamp.now();
        await ref.set({
            evaluationId: params.evalId,
            studentId: userId,
            studentName: userData.displayName || `${userData.firstName || ""} ${userData.lastName || ""}`.trim() || "Student",
            studentEmail: userData.email || "",
            repoUrl: `https://github.com/${parsed.owner}/${parsed.repo}`,
            repoRef: parsed.ref,
            status: "queued",
            attempt: (prev?.attempt ?? 0) + 1,
            retryCount: 0,
            repoMeta: null,
            overview: null,
            scores: null,
            totalScore: null,
            maxTotalScore: null,
            error: null,
            teacherReview: null,
            resultPublished: false,
            resultPublishedAt: null,
            submittedAt: now,
            processingStartedAt: null,
            processedAt: null,
            updatedAt: now,
        });

        // Display counters: count the student once; un-count a re-scored run.
        const counter: Record<string, any> = { updatedAt: now };
        if (!prev) counter.submissionCount = (evalData.submissionCount ?? 0) + 1;
        if (prev?.status === "scored") {
            counter.evaluatedCount = Math.max(0, (evalData.evaluatedCount ?? 1) - 1);
        }
        await adminDb.collection(PROJECT_EVALS).doc(params.evalId).update(counter).catch(() => {});

        const fresh = await ref.get();
        return NextResponse.json({
            submission: serializeSubmission(fresh, { forStudent: true }),
        });
    } catch (error: any) {
        console.error("Submit project failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
