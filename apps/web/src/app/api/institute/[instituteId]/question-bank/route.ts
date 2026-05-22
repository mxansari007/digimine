import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId, toIsoDate } from "@/lib/server/classroomAccess";
import { assertInstituteAdmin, isInstituteAdmin } from "@/lib/server/institutes";

export const dynamic = "force-dynamic";

const VALID_TYPES = new Set(["mcq", "text_input", "code"]);
const VALID_DIFFICULTY = new Set(["easy", "moderate", "hard"]);

function serializeQuestion(doc: FirebaseFirestore.DocumentSnapshot) {
    const data = doc.data() || {};
    return {
        id: doc.id,
        instituteId: data.instituteId,
        type: data.type || "mcq",
        questionText: data.questionText || "",
        options: Array.isArray(data.options) ? data.options : null,
        correctAnswer: data.correctAnswer ?? null,
        explanation: data.explanation ?? null,
        marks: typeof data.marks === "number" ? data.marks : 1,
        negativeMarks: typeof data.negativeMarks === "number" ? data.negativeMarks : 0,
        difficulty: data.difficulty || "moderate",
        subject: data.subject ?? null,
        topic: data.topic ?? null,
        tags: Array.isArray(data.tags) ? data.tags : [],
        createdBy: data.createdBy || "",
        createdAt: toIsoDate(data.createdAt),
        updatedAt: toIsoDate(data.updatedAt),
    };
}

/**
 * List the institute's shared question bank. Both admins and affiliated
 * teachers can read; teachers see it when authoring tests/quizzes.
 */
export async function GET(req: Request, { params }: { params: { instituteId: string } }) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) return NextResponse.json({ error: "Sign in" }, { status: 401 });

        // Either an admin of the institute OR an active teacher in it.
        const adminOk = await isInstituteAdmin(params.instituteId, userId);
        if (!adminOk) {
            const teacherRow = await adminDb
                .collection("institutes")
                .doc(params.instituteId)
                .collection("teachers")
                .doc(userId)
                .get();
            const ok = teacherRow.exists && teacherRow.data()?.status === "active";
            if (!ok) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const subject = searchParams.get("subject") || "";
        const difficulty = searchParams.get("difficulty") || "";
        const type = searchParams.get("type") || "";

        const snap = await adminDb
            .collection("institutes")
            .doc(params.instituteId)
            .collection("questionBank")
            .get();

        let questions = snap.docs.map(serializeQuestion);
        if (subject) questions = questions.filter((q) => (q.subject || "") === subject);
        if (difficulty) questions = questions.filter((q) => q.difficulty === difficulty);
        if (type) questions = questions.filter((q) => q.type === type);
        questions.sort((a, b) => {
            const aT = a.createdAt ? Date.parse(a.createdAt) : 0;
            const bT = b.createdAt ? Date.parse(b.createdAt) : 0;
            return bT - aT;
        });

        return NextResponse.json({ questions });
    } catch (error: any) {
        console.error("Question bank list failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}

export async function POST(req: Request, { params }: { params: { instituteId: string } }) {
    try {
        const auth = await assertInstituteAdmin(req, params.instituteId);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

        const body = await req.json().catch(() => ({}));
        const type = typeof body.type === "string" && VALID_TYPES.has(body.type) ? body.type : "mcq";
        const questionText = typeof body.questionText === "string" ? body.questionText.trim() : "";
        if (!questionText) return NextResponse.json({ error: "Question text required" }, { status: 400 });

        const marks = typeof body.marks === "number" && body.marks > 0 ? body.marks : 1;
        const negativeMarks = typeof body.negativeMarks === "number" ? Math.max(0, body.negativeMarks) : 0;
        const difficulty =
            typeof body.difficulty === "string" && VALID_DIFFICULTY.has(body.difficulty)
                ? body.difficulty
                : "moderate";
        const subject = typeof body.subject === "string" ? body.subject.trim() : "";
        const topic = typeof body.topic === "string" ? body.topic.trim() : "";
        const tags: string[] = Array.isArray(body.tags) ? body.tags.filter((t: any) => typeof t === "string") : [];

        let options: Array<{ id: string; text: string; isCorrect?: boolean }> | null = null;
        let correctAnswer: string | null = null;

        if (type === "mcq") {
            const rawOptions = Array.isArray(body.options) ? body.options : [];
            const built = rawOptions
                .filter((o: any) => o && typeof o.text === "string" && o.text.trim())
                .map((o: any) => ({
                    id: typeof o.id === "string" && o.id ? o.id : uuidv4(),
                    text: String(o.text).trim(),
                    isCorrect: Boolean(o.isCorrect),
                }));
            if (built.length < 2) {
                return NextResponse.json({ error: "MCQ needs at least 2 options" }, { status: 400 });
            }
            if (!built.some((o: { isCorrect: boolean }) => o.isCorrect)) {
                return NextResponse.json({ error: "Mark a correct option" }, { status: 400 });
            }
            options = built;
        } else if (type === "text_input") {
            correctAnswer = typeof body.correctAnswer === "string" ? body.correctAnswer.trim() : "";
            if (!correctAnswer) return NextResponse.json({ error: "Correct answer required" }, { status: 400 });
        }

        const ref = adminDb
            .collection("institutes")
            .doc(params.instituteId)
            .collection("questionBank")
            .doc();
        const now = Timestamp.now();
        const data = {
            instituteId: params.instituteId,
            type,
            questionText,
            options,
            correctAnswer,
            explanation: typeof body.explanation === "string" ? body.explanation.trim() : null,
            marks,
            negativeMarks,
            difficulty,
            subject: subject || null,
            topic: topic || null,
            tags,
            createdBy: auth.userId,
            createdAt: now,
            updatedAt: now,
        };
        await ref.set(data);
        return NextResponse.json({ question: serializeQuestion(await ref.get()) });
    } catch (error: any) {
        console.error("Question bank create failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
