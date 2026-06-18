"use client";

import { isValidSlug } from "@digimine/utils";
import { auth } from "../firebase/client";

/**
 * Catalog collections whose documents are keyed by slug (the slug IS the
 * Firestore document ID). Teacher- and institute-authored content shares
 * these collections with the admin-published catalog, so slugs are unique
 * platform-wide.
 */
export type SlugKeyedCollection = "quizzes" | "tests" | "courses" | "contests";

const LABELS: Record<SlugKeyedCollection, string> = {
    quizzes: "quiz",
    tests: "test series",
    courses: "course",
    contests: "contest",
};

/**
 * Validate a slug's format and reserve a unique one before it is used as a
 * document ID. Returns the slug the caller should actually use (auto-suffixed
 * `-2`, `-3`, … past any real collision).
 *
 * The existence check is delegated to the server (`POST /api/content/slug`,
 * admin SDK) ON PURPOSE: the client SDK can't tell "this slug is free" from
 * "this slug belongs to a doc I'm not allowed to read" — these owner-gated
 * collections return `permission-denied` for a non-existent doc too, which used
 * to make every brand-new slug look already-taken. The server sees true
 * existence, so the check is correct.
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

    const user = auth.currentUser;
    if (!user) {
        throw new Error("You need to be signed in to create content.");
    }

    const token = await user.getIdToken();
    const res = await fetch("/api/content/slug", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ collection: collectionName, slug: trimmed, excludeId }),
    });
    const data = (await res.json().catch(() => ({}))) as { slug?: string; error?: string };
    if (!res.ok || !data.slug) {
        throw new Error(data.error || `Could not reserve a slug for this ${label}.`);
    }
    return data.slug;
}
