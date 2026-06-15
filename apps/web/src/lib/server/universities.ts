/**
 * Server-side university directory — search + resolve-or-create, backed by the
 * `universities` Firestore collection and merged with the curated seed list so
 * the dropdown works before anything has been persisted.
 *
 * All access is via the Admin SDK (these run in API routes), so Firestore
 * rules don't gate it — the rules only need to keep clients out of the raw
 * collection (clients always go through /api/universities).
 */
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import {
    acronymOf,
    normalizeUniversityName,
    rankUniversityMatches,
    universitySlug,
    UNIVERSITY_AUTORESOLVE_THRESHOLD,
    UNIVERSITY_SUGGEST_THRESHOLD,
    type RankableUniversity,
    type RankedUniversity,
} from "@digimine/utils";
import type { ResolveUniversityResult, University, UniversityMatch } from "@digimine/types";
import { UNIVERSITY_SEED } from "./universitySeed";

const COL = "universities";

type AnyDoc = FirebaseFirestore.DocumentSnapshot | FirebaseFirestore.QueryDocumentSnapshot;

function uniq(arr: string[]): string[] {
    return Array.from(new Set(arr.filter(Boolean)));
}

/** Build the normalized alias set for a university (short name + acronym + extras). */
function aliasSet(name: string, shortName?: string | null, extra: string[] = []): string[] {
    return uniq([
        ...extra.map(normalizeUniversityName),
        shortName ? normalizeUniversityName(shortName) : "",
        acronymOf(name),
    ]);
}

function toDate(v: any): Date {
    if (v?.toDate) return v.toDate();
    if (v instanceof Date) return v;
    return new Date();
}

function docToRankable(d: AnyDoc): RankableUniversity {
    const data = d.data() || {};
    return {
        id: d.id,
        name: data.name,
        slug: data.slug,
        shortName: data.shortName ?? null,
        city: data.city ?? null,
        state: data.state ?? null,
        aliases: Array.isArray(data.aliases) ? data.aliases : [],
        normalizedName: data.normalizedName || normalizeUniversityName(data.name || ""),
        teacherCount: typeof data.teacherCount === "number" ? data.teacherCount : 0,
    };
}

function docToUniversity(d: AnyDoc): University {
    const data = d.data() || {};
    return {
        id: d.id,
        name: data.name,
        slug: data.slug,
        normalizedName: data.normalizedName || normalizeUniversityName(data.name || ""),
        aliases: Array.isArray(data.aliases) ? data.aliases : [],
        shortName: data.shortName ?? null,
        city: data.city ?? null,
        state: data.state ?? null,
        country: data.country || "IN",
        status: data.status || "pending",
        teacherCount: typeof data.teacherCount === "number" ? data.teacherCount : 0,
        createdBy: data.createdBy || "system",
        createdAt: toDate(data.createdAt),
        updatedAt: toDate(data.updatedAt),
    };
}

function seedCandidates(): RankableUniversity[] {
    return UNIVERSITY_SEED.map((s) => ({
        id: `seed:${universitySlug(s.name)}`,
        name: s.name,
        slug: universitySlug(s.name),
        shortName: s.shortName ?? null,
        city: s.city ?? null,
        state: s.state ?? null,
        aliases: aliasSet(s.name, s.shortName, s.aliases || []),
        normalizedName: normalizeUniversityName(s.name),
        teacherCount: 0,
    }));
}

/** DB rows that might match the query (prefix + alias/acronym exact). */
async function dbCandidates(query: string): Promise<RankableUniversity[]> {
    const norm = normalizeUniversityName(query);
    const out = new Map<string, RankableUniversity>();
    try {
        if (!norm) {
            const snap = await adminDb.collection(COL).orderBy("teacherCount", "desc").limit(10).get();
            snap.forEach((d) => out.set(d.id, docToRankable(d)));
            return [...out.values()];
        }
        const prefix = await adminDb
            .collection(COL)
            .orderBy("normalizedName")
            .startAt(norm)
            .endAt(norm + "")
            .limit(10)
            .get();
        prefix.forEach((d) => out.set(d.id, docToRankable(d)));

        const alias = await adminDb.collection(COL).where("aliases", "array-contains", norm).limit(5).get();
        alias.forEach((d) => out.set(d.id, docToRankable(d)));

        const ac = acronymOf(query);
        if (ac && ac !== norm) {
            const acSnap = await adminDb.collection(COL).where("aliases", "array-contains", ac).limit(5).get();
            acSnap.forEach((d) => out.set(d.id, docToRankable(d)));
        }
    } catch (e) {
        console.warn("[universities] dbCandidates failed:", e);
    }
    return [...out.values()];
}

/** DB rows win over seed rows for the same normalized name (no dup suggestions). */
function mergeCandidates(db: RankableUniversity[], seed: RankableUniversity[]): RankableUniversity[] {
    const have = new Set(db.map((d) => d.normalizedName));
    return [...db, ...seed.filter((s) => !have.has(s.normalizedName))];
}

function toMatch(r: RankedUniversity): UniversityMatch {
    return {
        university: {
            id: r.university.id,
            name: r.university.name,
            slug: r.university.slug || universitySlug(r.university.name),
            shortName: r.university.shortName ?? null,
            city: r.university.city ?? null,
            state: r.university.state ?? null,
        },
        score: Math.round(r.score * 100) / 100,
        matchedOn: r.matchedOn,
    };
}

export async function searchUniversities(query: string): Promise<ResolveUniversityResult> {
    const candidates = mergeCandidates(await dbCandidates(query), seedCandidates());
    const ranked = rankUniversityMatches(query, candidates, 8).filter(
        (r) => r.score >= UNIVERSITY_SUGGEST_THRESHOLD
    );
    const top = ranked[0] || null;
    const resolved = top && top.score >= UNIVERSITY_AUTORESOLVE_THRESHOLD ? top : null;
    return {
        query,
        resolved: resolved ? toMatch(resolved) : null,
        suggestions: ranked.map(toMatch),
        canCreate:
            normalizeUniversityName(query).length >= 3 &&
            (!top || top.score < UNIVERSITY_AUTORESOLVE_THRESHOLD),
    };
}

async function bump(ref: FirebaseFirestore.DocumentReference): Promise<void> {
    await ref
        .set({ teacherCount: FieldValue.increment(1), updatedAt: Timestamp.now() }, { merge: true })
        .catch(() => {});
}

/** Find an existing row by exact normalized name or a registered alias. */
async function findExisting(norm: string): Promise<FirebaseFirestore.QueryDocumentSnapshot | null> {
    const exact = await adminDb.collection(COL).where("normalizedName", "==", norm).limit(1).get();
    if (!exact.empty) return exact.docs[0];
    const alias = await adminDb.collection(COL).where("aliases", "array-contains", norm).limit(1).get();
    if (!alias.empty) return alias.docs[0];
    return null;
}

/** Idempotently write a university row (deterministic slug id; race-safe). */
async function persist(input: {
    name: string;
    shortName?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string;
    status: "active" | "pending";
    aliases: string[];
    createdBy: string;
}): Promise<University> {
    const norm = normalizeUniversityName(input.name);
    const existing = await findExisting(norm);
    if (existing) {
        await bump(existing.ref);
        return docToUniversity(existing);
    }

    let slug = universitySlug(input.name);
    let ref = adminDb.collection(COL).doc(slug);
    const clash = await ref.get();
    if (clash.exists) {
        if ((clash.data()?.normalizedName || "") === norm) {
            await bump(ref);
            return docToUniversity(clash);
        }
        // Different university wants the same slug — extremely rare; suffix it.
        slug = `${slug}-${Math.abs(hash(norm)) % 9999}`;
        ref = adminDb.collection(COL).doc(slug);
    }

    const now = Timestamp.now();
    const doc = {
        name: input.name.trim(),
        slug,
        normalizedName: norm,
        aliases: uniq([...input.aliases, acronymOf(input.name)]),
        shortName: input.shortName ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        country: input.country || "IN",
        status: input.status,
        teacherCount: 1,
        createdBy: input.createdBy,
        createdAt: now,
        updatedAt: now,
    };
    await ref.set(doc);
    return { id: ref.id, ...doc, createdAt: now.toDate(), updatedAt: now.toDate() } as University;
}

function hash(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
    return h;
}

/**
 * The smart entry point: given free text a teacher typed, return the canonical
 * university — reusing an existing/seed row when confident, creating a new
 * (pending) row only when nothing matches. Bumps teacherCount on reuse.
 */
export async function resolveOrCreateUniversity(
    rawName: string,
    uid: string
): Promise<{ university: University; created: boolean }> {
    const name = (rawName || "").trim();
    const norm = normalizeUniversityName(name);
    if (norm.length < 2) throw new Error("University name is too short");

    // 1) Exact normalized / alias hit in the DB.
    const existing = await findExisting(norm);
    if (existing) {
        await bump(existing.ref);
        return { university: docToUniversity(existing), created: false };
    }

    // 2) Confident fuzzy/acronym match among DB + seed.
    const ranked = rankUniversityMatches(name, mergeCandidates(await dbCandidates(name), seedCandidates()), 3);
    const top = ranked[0];
    if (top && top.score >= UNIVERSITY_AUTORESOLVE_THRESHOLD) {
        const id = String(top.university.id);
        if (!id.startsWith("seed:")) {
            const ref = adminDb.collection(COL).doc(id);
            const snap = await ref.get();
            if (snap.exists) {
                await bump(ref);
                return { university: docToUniversity(snap), created: false };
            }
        }
        // Seed match → persist it as a curated row, then return.
        const u = top.university;
        return {
            university: await persist({
                name: u.name,
                shortName: u.shortName ?? null,
                city: u.city ?? null,
                state: u.state ?? null,
                status: "active",
                aliases: u.aliases || [],
                createdBy: uid,
            }),
            created: true,
        };
    }

    // 3) Genuinely new — teacher-typed, mark pending for later curation.
    return {
        university: await persist({
            name,
            status: "pending",
            aliases: aliasSet(name, null, []),
            createdBy: uid,
        }),
        created: true,
    };
}
