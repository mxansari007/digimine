"use client";

import { doc, getDoc } from "firebase/firestore";
import { isValidSlug } from "@digimine/utils";
import { db } from "../firebase/client";

/**
 * Catalog collections that key their documents by slug (the slug IS the
 * Firestore document ID). Creating two documents with the same slug would
 * otherwise silently overwrite the first via `setDoc`, taking its
 * subcollections (questions, chapters, …) with it — so every creator must
 * reserve its slug through `assertSlugAvailable` first.
 */
export type SlugKeyedCollection = "quizzes" | "tests" | "courses" | "contests" | "products";

const LABELS: Record<SlugKeyedCollection, string> = {
    quizzes: "quiz",
    tests: "test series",
    courses: "course",
    contests: "contest",
    products: "product",
};

/**
 * Validate a slug's format and reserve it before it is used as a document ID.
 *
 * If the exact slug is already taken, the helper automatically appends an
 * incrementing suffix (`-2`, `-3`, ...) until a free slug is found, so a
 * creator never gets blocked by a collision with content they cannot see
 * (e.g. another author's private draft or a soft-deleted catalog entry).
 * The returned value is the slug the caller should actually use as the doc ID.
 *
 * `excludeId` lets an edit flow keep its own slug — pass the document's
 * current ID so a no-op rename doesn't report itself as a collision.
 *
 * Admins can read every document (Firestore rules grant `isDatabaseAdmin`
 * full read), so a `getDoc` existence check here is reliable for the admin
 * app — it sees drafts and private teacher content alike.
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

    let candidate = trimmed;
    let attempt = 0;
    const maxAttempts = 20;

    while (attempt < maxAttempts) {
        const snap = await getDoc(doc(db, collectionName, candidate));
        if (!snap.exists()) {
            return candidate;
        }
        if (excludeId && candidate === excludeId) {
            return candidate;
        }
        attempt++;
        candidate = `${trimmed}-${attempt + 1}`;
    }

    throw new Error(
        `Could not find a free slug for "${trimmed}" after ${maxAttempts} attempts ` +
            `(another ${label} may be using this slug). Please choose a different slug.`
    );
}
