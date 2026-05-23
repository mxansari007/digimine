/**
 * Meilisearch client + index helpers.
 *
 * The cluster runs on Heroku (see `infra/meilisearch`). Firestore stays the
 * source of truth — Meilisearch is a derived, ephemeral index that we
 * rebuild from Firestore on demand. Two configs are required:
 *
 *   MEILISEARCH_URL          e.g. https://placementranker-search.herokuapp.com
 *   MEILISEARCH_MASTER_KEY   the openssl-generated key from heroku config
 *
 * If either is missing, `getMeili()` throws — callers should guard with
 * `isSearchConfigured()` or accept the error and surface a 503.
 */
import { Meilisearch, type Index } from "meilisearch";

let _client: Meilisearch | null = null;

export function isSearchConfigured(): boolean {
    return Boolean(process.env.MEILISEARCH_URL && process.env.MEILISEARCH_MASTER_KEY);
}

export function getMeili(): Meilisearch {
    if (_client) return _client;
    const host = process.env.MEILISEARCH_URL;
    const apiKey = process.env.MEILISEARCH_MASTER_KEY;
    if (!host || !apiKey) {
        throw new Error(
            "Search is not configured. Set MEILISEARCH_URL and MEILISEARCH_MASTER_KEY."
        );
    }
    _client = new Meilisearch({ host, apiKey, timeout: 8_000 });
    return _client;
}

/**
 * One global index for everything. `type` discriminates between articles,
 * problems, tests, etc. — the search UI can filter by type. Keeping it in one
 * index simplifies a top-of-page omnibar search (single query, ranked hits
 * across all content) and stays well under Meilisearch's per-index overhead
 * for our scale (~1k docs total).
 */
export const SEARCH_INDEX = "catalog";

export type SearchDocType =
    | "article"
    | "problem"
    | "test"
    | "quiz"
    | "contest"
    | "course"
    | "product";

export type SearchDoc = {
    /** `${type}:${slug}` — keep across reindexes so updates are idempotent. */
    id: string;
    type: SearchDocType;
    title: string;
    /** One-liner shown under the title in search results. */
    description: string;
    /** Free-form text we want hits in but not always displayed (article body, etc.). */
    content?: string;
    slug: string;
    /** Public URL the result links to. */
    url: string;
    tags?: string[];
    category?: string;
    /** Sort key for "newest first" tie-breakers. */
    publishedAtMs?: number;
    /** True when the doc is free for students (free article, free test, etc.). */
    isFree?: boolean;
};

/**
 * Settings applied to the catalog index. Idempotent — calling `configureIndex`
 * multiple times is safe; Meilisearch only re-applies if something changed.
 */
export async function configureIndex(): Promise<Index<SearchDoc>> {
    const client = getMeili();
    // `createIndex` is no-op if the index already exists.
    await client.createIndex(SEARCH_INDEX, { primaryKey: "id" }).catch(() => {});
    const index = client.index<SearchDoc>(SEARCH_INDEX);

    // Field weights — `title` is the most important match, then description,
    // then full content. `tags` and `category` provide cheap boosts.
    await index.updateSettings({
        searchableAttributes: [
            "title",
            "description",
            "tags",
            "category",
            "content",
        ],
        filterableAttributes: ["type", "category", "isFree"],
        sortableAttributes: ["publishedAtMs"],
        // Typo tolerance defaults are fine; bump min length so 2-char queries
        // ("os", "cn") still need to match exactly — placement audience cares.
        typoTolerance: {
            minWordSizeForTypos: { oneTypo: 5, twoTypos: 9 },
        },
        // Faceting we'll surface in the UI later.
        faceting: { maxValuesPerFacet: 50 },
    });

    return index;
}

/** Upsert helper used by per-collection sync paths. */
export async function indexDocs(docs: SearchDoc[]): Promise<void> {
    if (docs.length === 0) return;
    const index = (await configureIndex()) as Index<SearchDoc>;
    await index.addDocuments(docs, { primaryKey: "id" });
}

/** Remove a single doc from the index (admin delete paths). */
export async function removeDoc(id: string): Promise<void> {
    const index = (await configureIndex()) as Index<SearchDoc>;
    await index.deleteDocument(id);
}

/** Drop the entire index — used at the start of a full reindex. */
export async function clearIndex(): Promise<void> {
    const index = (await configureIndex()) as Index<SearchDoc>;
    await index.deleteAllDocuments();
}
