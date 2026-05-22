import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { slugifyProblemTitle, type CreatePracticeProblemInput } from "@digimine/types";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { adminDb } from "@/lib/firebase/admin";
import { PROBLEMS } from "@/lib/server/practice";

export const dynamic = "force-dynamic";

const BOOTSTRAP_ADMINS = new Set([
    "admin@digimine.com",
    "maazansari@digimine.com",
    "mxansari007@gmail.com",
    "maazansari@gmail.com",
    "admin@digimine.shop",
]);

async function assertAdmin(req: Request): Promise<{ ok: true; userId: string } | { ok: false; status: number }> {
    const userId = await getBearerUserId(req).catch(() => null);
    if (!userId) return { ok: false, status: 401 };
    const snap = await adminDb.collection("users").doc(userId).get();
    const data = snap.data() || {};
    const role = data.role;
    const email = (data.email || "").toLowerCase();
    if (role === "admin" || role === "super_admin" || BOOTSTRAP_ADMINS.has(email)) {
        return { ok: true, userId };
    }
    return { ok: false, status: 403 };
}

async function uniqueSlug(desired: string): Promise<string> {
    const base = slugifyProblemTitle(desired) || "problem";
    let candidate = base;
    for (let i = 2; i < 25; i++) {
        const exists = await adminDb.collection(PROBLEMS).where("slug", "==", candidate).limit(1).get();
        if (exists.empty) return candidate;
        candidate = `${base}-${i}`;
    }
    return `${base}-${Date.now().toString(36)}`;
}

function buildDoc(input: CreatePracticeProblemInput, slug: string, userId: string, now: Timestamp) {
    return {
        slug,
        kind: input.kind,
        title: input.title.trim(),
        statementHtml: input.statementHtml || "",
        difficulty: input.difficulty,
        primaryPattern: input.primaryPattern,
        secondaryPatterns: input.secondaryPatterns || [],
        tags: input.tags || [],
        patternChoices: input.patternChoices && input.patternChoices.length ? input.patternChoices : [input.primaryPattern],
        languages: input.languages || ["python", "javascript", "cpp", "java"],
        starters: input.starters || [],
        testCases: input.testCases || [],
        constraintsHtml: input.constraintsHtml ?? null,
        timeLimitMs: input.timeLimitMs ?? 5000,
        memoryLimitMb: input.memoryLimitMb ?? 256,
        sql: input.sql ?? null,
        editorialHtml: input.editorialHtml ?? null,
        hints: input.hints || [],
        solutions: input.solutions || [],
        status: input.status || "draft",
        access: input.access || "free",
        totalSubmissions: 0,
        totalSolved: 0,
        isFeatured: Boolean(input.isFeatured),
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
    };
}

/**
 * Create one problem, or bulk-seed many.
 * Body: a single CreatePracticeProblemInput, OR { problems: [...] }.
 */
export async function POST(req: Request) {
    try {
        const auth = await assertAdmin(req);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.status === 401 ? "Sign in" : "Admin only" }, { status: auth.status });
        }

        const body = await req.json().catch(() => ({}));
        const list: CreatePracticeProblemInput[] = Array.isArray(body?.problems)
            ? body.problems
            : body?.title
            ? [body as CreatePracticeProblemInput]
            : [];
        if (list.length === 0) {
            return NextResponse.json({ error: "Provide a problem or { problems: [...] }" }, { status: 400 });
        }

        const now = Timestamp.now();
        const created: Array<{ id: string; slug: string; title: string }> = [];
        const errors: string[] = [];

        for (const input of list) {
            if (!input.title || !input.kind || !input.difficulty || !input.primaryPattern) {
                errors.push(`Skipped "${input.title || "(untitled)"}": missing title/kind/difficulty/primaryPattern`);
                continue;
            }
            const slug = await uniqueSlug(input.slug || input.title);
            const ref = adminDb.collection(PROBLEMS).doc();
            await ref.set(buildDoc(input, slug, auth.userId, now));
            created.push({ id: ref.id, slug, title: input.title });
        }

        return NextResponse.json({ created, createdCount: created.length, errors });
    } catch (error: any) {
        console.error("Admin create practice problem failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
