/**
 * Mega-nav configuration loader.
 *
 * Source of truth is the Firestore doc `site_config/mega_nav`. Reads go
 * through the shared Redis cache (`cachedJson`) so the fleet does at most
 * one Firestore read per `TTL_SECONDS` — important because the header
 * renders on every page.
 *
 * Fail-open: if Firestore or Redis hiccup, return the hard-coded
 * `STATIC_MEGA_NAV` from `megaNavData.ts` so the header never breaks.
 *
 * Admin edits go through `writeMegaNavConfig()` which writes the doc and
 * invalidates the cache key in one shot.
 */
import { adminDb } from "@/lib/firebase/admin";
import { cachedJson, invalidateCache } from "@/lib/server/cache";
import { megaNav as STATIC_MEGA_NAV, type MegaItem } from "@/components/layout/megaNavData";

const FIRESTORE_DOC = { collection: "site_config", id: "mega_nav" } as const;
const CACHE_KEY = "site:megaNav:v1";
const TTL_SECONDS = 300; // 5 min — admin invalidates on save anyway.

const VALID_ACCENTS: MegaItem["accent"][] = [
    "primary",
    "amber",
    "emerald",
    "indigo",
    "rose",
    "violet",
];

/**
 * Coerce arbitrary Firestore data back into a strongly-typed MegaItem[].
 * Any unrecognised shape falls back to the static config so a partial
 * admin edit can't crash the public header.
 */
function coerceItems(raw: unknown): MegaItem[] | null {
    if (!Array.isArray(raw)) return null;
    const out: MegaItem[] = [];
    for (const r of raw) {
        if (!r || typeof r !== "object") continue;
        const o = r as Record<string, unknown>;
        const label = typeof o.label === "string" ? o.label : "";
        const href = typeof o.href === "string" ? o.href : "";
        if (!label || !href) continue;
        const accent = (VALID_ACCENTS as string[]).includes(String(o.accent))
            ? (o.accent as MegaItem["accent"])
            : "primary";
        const hero = (o.hero || {}) as Record<string, unknown>;
        const cta = (hero.cta || {}) as Record<string, unknown>;
        const item: MegaItem = {
            label,
            href,
            accent,
            hero: {
                heading: String(hero.heading || ""),
                description: String(hero.description || ""),
                cta: {
                    label: String(cta.label || ""),
                    href: String(cta.href || href),
                },
                gradient: String(hero.gradient || "from-primary-500 to-primary-600"),
                imageUrl: typeof hero.imageUrl === "string" ? hero.imageUrl : undefined,
                stats: Array.isArray(hero.stats)
                    ? (hero.stats as unknown[])
                          .map((s) => {
                              const v = (s || {}) as Record<string, unknown>;
                              return {
                                  value: String(v.value || ""),
                                  label: String(v.label || ""),
                              };
                          })
                          .filter((s) => s.value && s.label)
                    : undefined,
            },
            sections: Array.isArray(o.sections)
                ? (o.sections as unknown[]).map((s) => {
                      const v = (s || {}) as Record<string, unknown>;
                      return {
                          heading: String(v.heading || ""),
                          items: Array.isArray(v.items)
                              ? (v.items as unknown[])
                                    .map((i) => {
                                        const it = (i || {}) as Record<string, unknown>;
                                        return {
                                            label: String(it.label || ""),
                                            href: String(it.href || ""),
                                            description:
                                                typeof it.description === "string"
                                                    ? it.description
                                                    : undefined,
                                        };
                                    })
                                    .filter((i) => i.label && i.href)
                              : [],
                      };
                  })
                : [],
            featured: Array.isArray(o.featured)
                ? (o.featured as unknown[])
                      .map((f) => {
                          const v = (f || {}) as Record<string, unknown>;
                          return {
                              title: String(v.title || ""),
                              description: String(v.description || ""),
                              href: String(v.href || ""),
                              gradient: String(
                                  v.gradient || "from-primary-500 to-primary-600"
                              ),
                              imageUrl:
                                  typeof v.imageUrl === "string" ? v.imageUrl : undefined,
                              badge: typeof v.badge === "string" ? v.badge : undefined,
                          };
                      })
                      .filter((f) => f.title && f.href)
                : [],
        };
        out.push(item);
    }
    return out.length > 0 ? out : null;
}

/**
 * Public read path — used by the public layout to feed the Header.
 * Returns the static fallback on any failure so the page always renders.
 */
export async function getMegaNavItems(): Promise<MegaItem[]> {
    try {
        const data = await cachedJson<MegaItem[] | null>(
            CACHE_KEY,
            TTL_SECONDS,
            async () => {
                const snap = await adminDb
                    .collection(FIRESTORE_DOC.collection)
                    .doc(FIRESTORE_DOC.id)
                    .get();
                if (!snap.exists) return null;
                const raw = snap.data()?.items;
                return coerceItems(raw);
            },
            { negativeTtlSeconds: 60 }
        );
        if (data && data.length > 0) return data;
    } catch (err) {
        console.error("[megaNavConfig] read failed:", err);
    }
    return STATIC_MEGA_NAV;
}

/**
 * Admin write path. Drops the cache key so the next public read picks the
 * fresh data without waiting for the TTL.
 */
export async function writeMegaNavItems(items: MegaItem[]): Promise<void> {
    await adminDb
        .collection(FIRESTORE_DOC.collection)
        .doc(FIRESTORE_DOC.id)
        .set(
            {
                items,
                updatedAt: new Date(),
            },
            { merge: true }
        );
    await invalidateCache(CACHE_KEY);
}

/** Admin read — bypasses cache so the editor always sees latest saved state. */
export async function readMegaNavItemsForAdmin(): Promise<MegaItem[]> {
    const snap = await adminDb
        .collection(FIRESTORE_DOC.collection)
        .doc(FIRESTORE_DOC.id)
        .get();
    if (snap.exists) {
        const items = coerceItems(snap.data()?.items);
        if (items && items.length > 0) return items;
    }
    return STATIC_MEGA_NAV;
}

export { STATIC_MEGA_NAV };
