import {
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    limit as fbLimit,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    where,
} from "firebase/firestore";
import {
    slugifyProblemTitle,
    type CreatePracticeProblemInput,
    type PracticeProblem,
} from "@digimine/types";
import { db } from "@/lib/firebase/client";

const COL = () => collection(db, "practiceProblems");

// Firestore forbids arrays-of-arrays, so a SQL problem's 2-D `expectedRows`
// is stored as an array of { cells: [...] } maps. Encode on write, decode on
// read. (Mirrors apps/web/src/lib/server/practice.ts so both apps agree.)
function encodeSqlForStore(sql: any) {
    if (!sql) return null;
    const rows = Array.isArray(sql.expectedRows) ? sql.expectedRows : [];
    return {
        schemaSql: sql.schemaSql || "",
        solutionSql: sql.solutionSql || "",
        orderMatters: Boolean(sql.orderMatters),
        expectedColumns: Array.isArray(sql.expectedColumns) ? sql.expectedColumns : [],
        expectedRows: rows.map((r: any) => ({ cells: Array.isArray(r) ? r : [] })),
    };
}

function decodeSqlFromStore(sql: any) {
    if (!sql) return null;
    const rows = Array.isArray(sql.expectedRows) ? sql.expectedRows : [];
    return {
        schemaSql: sql.schemaSql || "",
        solutionSql: sql.solutionSql || "",
        orderMatters: Boolean(sql.orderMatters),
        expectedColumns: Array.isArray(sql.expectedColumns) ? sql.expectedColumns : [],
        expectedRows: rows.map((r: any) => (r && Array.isArray(r.cells) ? r.cells : Array.isArray(r) ? r : [])),
    };
}

function mapProblem(id: string, d: any): PracticeProblem {
    return {
        id,
        slug: d.slug || "",
        kind: d.kind || "dsa",
        title: d.title || "",
        statementHtml: d.statementHtml || "",
        difficulty: d.difficulty || "easy",
        primaryPattern: d.primaryPattern || "arrays-hashing",
        secondaryPatterns: d.secondaryPatterns || [],
        tags: d.tags || [],
        patternChoices: d.patternChoices || [],
        languages: d.languages || ["python", "javascript", "cpp", "java"],
        starters: d.starters || [],
        testCases: d.testCases || [],
        constraintsHtml: d.constraintsHtml ?? null,
        timeLimitMs: d.timeLimitMs ?? 5000,
        memoryLimitMb: d.memoryLimitMb ?? 256,
        sql: decodeSqlFromStore(d.sql),
        editorialHtml: d.editorialHtml ?? null,
        hints: d.hints || [],
        solutions: d.solutions || [],
        status: d.status || "draft",
        access: d.access || "free",
        totalSubmissions: d.totalSubmissions ?? 0,
        totalSolved: d.totalSolved ?? 0,
        isFeatured: Boolean(d.isFeatured),
        createdBy: d.createdBy || "",
        createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : new Date(),
        updatedAt: d.updatedAt?.toDate ? d.updatedAt.toDate() : new Date(),
    };
}

export async function listProblems(opts?: {
    kind?: "dsa" | "sql" | "all";
    status?: string;
    limit?: number;
}): Promise<PracticeProblem[]> {
    const constraints: any[] = [];
    if (opts?.kind && opts.kind !== "all") constraints.push(where("kind", "==", opts.kind));
    if (opts?.status && opts.status !== "all") constraints.push(where("status", "==", opts.status));
    constraints.push(orderBy("createdAt", "desc"));
    if (opts?.limit) constraints.push(fbLimit(opts.limit));
    const snap = await getDocs(query(COL(), ...constraints));
    return snap.docs.map((d) => mapProblem(d.id, d.data() || {}));
}

export async function getProblem(id: string): Promise<PracticeProblem | null> {
    const snap = await getDoc(doc(COL(), id));
    if (!snap.exists()) return null;
    return mapProblem(snap.id, snap.data() || {});
}

async function uniqueSlug(desired: string, excludeId?: string): Promise<string> {
    const base = slugifyProblemTitle(desired) || "problem";
    let candidate = base;
    for (let i = 2; i < 30; i++) {
        const snap = await getDocs(query(COL(), where("slug", "==", candidate), fbLimit(2)));
        const taken = snap.docs.some((d) => d.id !== excludeId);
        if (!taken) return candidate;
        candidate = `${base}-${i}`;
    }
    return `${base}-${Date.now().toString(36)}`;
}

function buildPayload(input: CreatePracticeProblemInput, slug: string, adminUid: string, isNew: boolean) {
    const payload: any = {
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
        sql: input.sql ? encodeSqlForStore(input.sql) : null,
        editorialHtml: input.editorialHtml ?? null,
        hints: input.hints || [],
        solutions: input.solutions || [],
        status: input.status || "draft",
        access: input.access || "free",
        isFeatured: Boolean(input.isFeatured),
        updatedAt: serverTimestamp(),
    };
    if (isNew) {
        payload.createdBy = adminUid;
        payload.totalSubmissions = 0;
        payload.totalSolved = 0;
        payload.createdAt = serverTimestamp();
    }
    return payload;
}

export async function createProblem(input: CreatePracticeProblemInput, adminUid: string): Promise<string> {
    const id = doc(COL()).id;
    const slug = await uniqueSlug(input.slug || input.title);
    await setDoc(doc(COL(), id), buildPayload(input, slug, adminUid, true));
    return id;
}

export async function updateProblem(id: string, input: CreatePracticeProblemInput, adminUid: string): Promise<void> {
    const existing = await getProblem(id);
    if (!existing) throw new Error("Problem not found");
    const slug =
        input.slug && input.slug !== existing.slug ? await uniqueSlug(input.slug, id) : existing.slug;
    await setDoc(doc(COL(), id), buildPayload(input, slug, adminUid, false), { merge: true });
}

export async function deleteProblem(id: string): Promise<void> {
    await deleteDoc(doc(COL(), id));
}

/** Bulk create — used by the JSON importer. Returns per-item results. */
export async function bulkCreateProblems(
    inputs: CreatePracticeProblemInput[],
    adminUid: string
): Promise<{ created: { id: string; title: string; slug: string }[]; errors: string[] }> {
    const created: { id: string; title: string; slug: string }[] = [];
    const errors: string[] = [];
    for (const input of inputs) {
        if (!input.title || !input.kind || !input.difficulty || !input.primaryPattern) {
            errors.push(`Skipped "${input.title || "(untitled)"}" — missing title/kind/difficulty/primaryPattern`);
            continue;
        }
        try {
            const id = await createProblem(input, adminUid);
            const slug = (await getProblem(id))?.slug || "";
            created.push({ id, title: input.title, slug });
        } catch (e: any) {
            errors.push(`Failed "${input.title}": ${e.message || "error"}`);
        }
    }
    return { created, errors };
}
