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
 * Validate a slug's format and guarantee it is free before it is used as a
 * document ID. Throws a human-readable error (surfaced by the builder forms'
 * try/catch → inline banner) when the slug is malformed or already taken.
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

    const snap = await getDoc(doc(db, collectionName, trimmed));
    if (snap.exists()) {
        throw new Error(
            `The slug "${trimmed}" is already used by another ${label}. ` +
                "Please choose a different slug."
        );
    }
    return trimmed;
}
