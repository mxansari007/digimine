import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import {
    assertClassEnrollment,
    getClassById,
    serializeClass,
} from "@/lib/server/classes";
import { getBearerUserId, toIsoDate } from "@/lib/server/classroomAccess";
import {
    PROJECT_SUBMISSIONS,
    listClassProjectEvals,
    serializeEvaluation,
    serializeSubmission,
    submissionDocId,
} from "@/lib/server/projectEval/store";

export const dynamic = "force-dynamic";

/** Light row shape shared by every classroom content lane. */
function serializeContentRow(doc: FirebaseFirestore.QueryDocumentSnapshot) {
    const data = doc.data() || {};
    return {
        id: doc.id,
        slug: data.slug || doc.id,
        title: data.title || data.name || "Untitled",
        description: data.description || data.shortDescription || "",
        totalQuestions: data.totalQuestions ?? 0,
        totalTests: data.totalTests ?? 0,
        totalMarks: data.totalMarks ?? 0,
        duration: data.duration ?? data.durationMinutes ?? 0,
        timeLimitMinutes: data.timeLimitMinutes ?? 0,
        estimatedHours: data.estimatedHours ?? 0,
        totalModules: data.totalModules ?? 0,
        totalLessons: data.totalLessons ?? 0,
        difficulty: data.difficulty || null,
        category: data.category || null,
        startTime: toIsoDate(data.startTime),
        endTime: toIsoDate(data.endTime),
        createdAt: toIsoDate(data.createdAt),
    };
}

export async function GET(req: Request, { params }: { params: { classId: string } }) {
    try {
        const classDoc = await getClassById(params.classId);
        if (!classDoc) return NextResponse.json({ error: "Class not found" }, { status: 404 });

        const { searchParams } = new URL(req.url);
        // `?studentId=` is still accepted but MUST match the bearer token
        // when present. Pre-fix, an unauthenticated caller could probe any
        // student's enrollment status by passing their uid as the query.
        const tokenUserId = await getBearerUserId(req).catch(() => null);
        const queryStudentId = searchParams.get("studentId");
        if (queryStudentId && tokenUserId && queryStudentId !== tokenUserId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const studentId = queryStudentId && queryStudentId === tokenUserId ? queryStudentId : null;

        // Public-ish read of the class shell — teacher info, name, invite code.
        // We don't return content lists here unless the caller is enrolled.
        const teacherSnap = await adminDb.collection("teachers").doc(classDoc.teacherId).get();
        const teacherData = teacherSnap.exists ? teacherSnap.data() : null;
        const teacher = {
            id: classDoc.teacherId,
            profile: teacherData?.profile || {},
            subjects: teacherData?.profile?.subjects || [],
        };

        // Enrollment check. Both an explicit studentId (used by the
        // student-facing page) and the bearer token (when called with auth)
        // can confirm enrollment; bearer takes precedence.
        let enrolled = false;
        let userId: string | null = null;
        const accessResult = await assertClassEnrollment(req, params.classId).catch(() => null);
        if (accessResult && accessResult.allowed) {
            enrolled = true;
            userId = accessResult.userId;
        } else if (studentId) {
            const memberSnap = await adminDb
                .collection("classes")
                .doc(params.classId)
                .collection("students")
                .doc(studentId)
                .get();
            enrolled = memberSnap.exists && memberSnap.data()?.status === "active";
            userId = studentId;
        }

        // Content assigned to this class — full light rows, not just counts,
        // so the classroom hub can render the actual work board in one fetch.
        const counts = { quizzes: 0, tests: 0, contests: 0, courses: 0, projectEvals: 0 };
        const content: {
            quizzes: any[];
            tests: any[];
            contests: any[];
            courses: any[];
            projectEvals: any[];
        } = { quizzes: [], tests: [], contests: [], courses: [], projectEvals: [] };

        if (enrolled) {
            const collections = ["quizzes", "tests", "contests", "courses"] as const;
            await Promise.all([
                ...collections.map(async (col) => {
                    // No teacherId filter — institute-authored content
                    // has `teacherId: ""` and would otherwise be dropped
                    // for enrolled students. classIds membership is the only
                    // constraint needed; class-enrollment auth is upstream.
                    const snap = await adminDb
                        .collection(col)
                        .where("classIds", "array-contains", params.classId)
                        .get();
                    const rows = snap.docs
                        .filter((d) => {
                            const data = d.data() || {};
                            return data.status === "published" && !data.isDeleted;
                        })
                        .map(serializeContentRow)
                        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
                    counts[col] = rows.length;
                    content[col] = rows;
                }),
                (async () => {
                    const evals = await listClassProjectEvals({
                        id: params.classId,
                        teacherId: classDoc.teacherId,
                    });
                    counts.projectEvals = evals.length;
                    content.projectEvals = await Promise.all(
                        evals.map(async (ev) => {
                            const subSnap = userId
                                ? await adminDb
                                      .collection(PROJECT_SUBMISSIONS)
                                      .doc(submissionDocId(ev.id, userId))
                                      .get()
                                : null;
                            return {
                                ...serializeEvaluation(ev),
                                mySubmission:
                                    subSnap?.exists
                                        ? serializeSubmission(subSnap, { forStudent: true })
                                        : null,
                            };
                        })
                    );
                })(),
            ]);
        }

        return NextResponse.json({
            class: serializeClass({ id: classDoc.id, ...classDoc }),
            teacher,
            enrolled,
            userId,
            counts,
            content,
        });
    } catch (error: any) {
        console.error("Class page-data error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to load class" },
            { status: 500 }
        );
    }
}
