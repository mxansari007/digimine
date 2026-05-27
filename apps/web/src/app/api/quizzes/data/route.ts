import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { assertTeacherContentAccess, isPublicApprovedTeacherContent, isPublishedContent, toIsoDate } from "@/lib/server/classroomAccess";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const slug = searchParams.get("slug");
        const teacherId = searchParams.get("teacherId");
        const classId = searchParams.get("classId");

        if (!slug) {
            return NextResponse.json({ error: "slug required" }, { status: 400 });
        }

        let quizDoc: FirebaseFirestore.DocumentSnapshot | null = null;

        // Try direct doc lookup by slug as ID
        const directSnap = await adminDb.collection("quizzes").doc(slug).get();
        if (directSnap.exists) {
            quizDoc = directSnap;
        } else {
            // Try query by slug field
            const querySnap = await adminDb
                .collection("quizzes")
                .where("slug", "==", slug)
                .limit(1)
                .get();

            if (!querySnap.empty) {
                quizDoc = querySnap.docs[0];
            }
        }

        if (!quizDoc || !quizDoc.exists) {
            return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
        }

        const data = quizDoc.data()!;

        if (teacherId || classId) {
            const access = await assertTeacherContentAccess(req, data, teacherId, { classId });
            if (!access.allowed) {
                return NextResponse.json({ error: access.error }, { status: access.status });
            }
        } else {
            // Public-catalogue access path. Reject anything that is not
            // safely public:
            //   - not published (draft / archived)
            //   - teacher-authored content not promoted to the public catalogue
            //   - institute-authored content (teacherId empty but instituteId
            //     set) — these are classroom-private and MUST be reached via
            //     the teacherId/classId branch above. Without this guard, an
            //     anonymous request with just ?slug=… could fetch private
            //     institute quizzes.
            const isInstitutePrivate = !data.teacherId && Boolean(data.instituteId);
            if (
                !isPublishedContent(data) ||
                (data.teacherId && !isPublicApprovedTeacherContent(data)) ||
                isInstitutePrivate
            ) {
                return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
            }
        }

        const quiz = {
            id: quizDoc.id,
            ...data,
            createdAt: toIsoDate(data.createdAt),
            updatedAt: toIsoDate(data.updatedAt),
        };

        // Also load questions
        const questionsSnap = await adminDb
            .collection("quizzes")
            .doc(quizDoc.id)
            .collection("questions")
            .orderBy("order", "asc")
            .get();

        const questions = questionsSnap.docs.map((qDoc) => {
            const qData = qDoc.data();
            // Return the full question doc so code questions keep their
            // language list, starters, scoring config, etc.
            return {
                id: qDoc.id,
                quizId: quizDoc!.id,
                ...qData,
            };
        });

        return NextResponse.json({ quiz, questions });
    } catch (error: any) {
        console.error("Quiz data API error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to load quiz" },
            { status: 500 }
        );
    }
}
