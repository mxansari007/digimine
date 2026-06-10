"use client";

import { doc, getDoc, type FirestoreError } from "firebase/firestore";
import { isValidSlug } from "@digimine/utils";
import { db } from "../firebase/client";

/**
 * Catalog collections whose documents are keyed by slug (the slug IS the
 * Firestore document ID). Teacher- and institute-authored content shares
 * these collections with the admin-published catalog, so slugs are unique
 * platform-wide — using the slug as the document ID enforces that at the
 * database level (a duplicate becomes an overwrite that the rules reject).
 */
export type SlugKeyedCollection = "quizzes" | "tests" | "courses" | "contests";

const LABELS: Record<SlugKeyedCollection, string> = {
    quizzes: "quiz",
    tests: "test series",
    courses: "course",
    contests: "contest",
};

function isPermissionDenied(err: unknown): boolean {
    return (err as FirestoreError)?.code === "permission-denied";
}

/**
 * Validate a slug's format and reserve it before it is used as a document ID.
 * Throws a human-readable error (surfaced by the builder forms' try/catch →
 * inline banner) when the slug is malformed or already taken.
 *
 * Read-visibility caveat: a teacher cannot read another author's *private*
 * document, so `getDoc` returns `permission-denied` rather than a hit when
 * the slug is taken by someone else's draft. We treat that as "taken" — it
 * is the safe choice (the slug genuinely exists, and the subsequent `setDoc`
 * would be denied as an overwrite anyway), so the author is told to pick a
 * different slug instead of hitting a cryptic permission error at write time.
 */
export async function assertSlugAvailable(
    collectionName: SlugKeyedCollection,
    slug: string,
    excludeId?: string
): Promise<string> {
    const trimmed = (slug || "").trim();
    const label = LABELS[collectionName];

    if (!trimmed) {
        throw new Error(`A slug is required to create a ${label}.`);
    }
    if (!isValidSlug(trimmed)) {
        throw new Error(
            "Slug can only contain lowercase letters, numbers, and single hyphens " +
                "(e.g. \"data-structures-101\")."
        );
    }
    if (excludeId && trimmed === excludeId) {
        // Editing without changing the slug — nothing to check.
        return trimmed;
    }

    try {
        const snap = await getDoc(doc(db, collectionName, trimmed));
        if (snap.exists()) {
            throw new Error(
                `The slug "${trimmed}" is already taken. Please choose a different slug.`
            );
        }
    } catch (err) {
        if (isPermissionDenied(err)) {
            // The slug exists but belongs to another author's private content.
            throw new Error(
                `The slug "${trimmed}" is already taken. Please choose a different slug.`
            );
        }
        throw err;
    }
    return trimmed;
}
