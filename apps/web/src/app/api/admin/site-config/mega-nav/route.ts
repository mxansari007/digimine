/**
 * Admin mega-nav config endpoints.
 *
 *   GET   /api/admin/site-config/mega-nav   → current items (bypasses Redis)
 *   PUT   /api/admin/site-config/mega-nav   → replace items + invalidate cache
 *
 * Both require admin / super_admin. The PUT body must be `{ items: MegaItem[] }`
 * — server re-validates the structure before persisting so a malformed
 * payload can't corrupt the doc.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/middleware/requireAdmin";
import {
    readMegaNavItemsForAdmin,
    writeMegaNavItems,
} from "@/lib/server/megaNavConfig";
import { adminDb } from "@/lib/firebase/admin";
import { invalidateCache } from "@/lib/server/cache";
import { corsPreflight, withCors } from "@/lib/server/adminCors";
import type { MegaItem } from "@/components/layout/megaNavData";

export const dynamic = "force-dynamic";

const VALID_ACCENTS: MegaItem["accent"][] = [
    "primary",
    "amber",
    "emerald",
    "indigo",
    "rose",
    "violet",
];

interface ValidationError {
    path: string;
    message: string;
}

/**
 * Strict validation — runs before write so a malformed payload from a
 * misbehaving admin client can't poison the cache and break the public
 * header.
 */
function validateItems(raw: unknown): { ok: true; items: MegaItem[] } | { ok: false; errors: ValidationError[] } {
    const errors: ValidationError[] = [];
    if (!Array.isArray(raw)) {
        return { ok: false, errors: [{ path: "items", message: "Expected an array" }] };
    }
    if (raw.length === 0) {
        return { ok: false, errors: [{ path: "items", message: "Must have at least one top-level item" }] };
    }
    if (raw.length > 8) {
        return { ok: false, errors: [{ path: "items", message: "At most 8 top-level items allowed" }] };
    }

    const isHref = (v: unknown): v is string =>
        typeof v === "string" && (v.startsWith("/") || /^https?:\/\//.test(v));

    const items: MegaItem[] = [];
    raw.forEach((entry, i) => {
        if (!entry || typeof entry !== "object") {
            errors.push({ path: `items[${i}]`, message: "Must be an object" });
            return;
        }
        const o = entry as Record<string, unknown>;
        if (typeof o.label !== "string" || !o.label.trim()) {
            errors.push({ path: `items[${i}].label`, message: "Required" });
        }
        if (!isHref(o.href)) {
            errors.push({
                path: `items[${i}].href`,
                message: "Must start with / or http(s)://",
            });
        }
        const accent = (VALID_ACCENTS as string[]).includes(String(o.accent))
            ? (o.accent as MegaItem["accent"])
            : null;
        if (!accent) {
            errors.push({
                path: `items[${i}].accent`,
                message: `Must be one of: ${VALID_ACCENTS.join(", ")}`,
            });
        }
        const hero = (o.hero || {}) as Record<string, unknown>;
        if (typeof hero.heading !== "string" || !hero.heading.trim()) {
            errors.push({ path: `items[${i}].hero.heading`, message: "Required" });
        }
        if (typeof hero.description !== "string" || !hero.description.trim()) {
            errors.push({ path: `items[${i}].hero.description`, message: "Required" });
        }
        const cta = (hero.cta || {}) as Record<string, unknown>;
        if (typeof cta.label !== "string" || !cta.label.trim()) {
            errors.push({ path: `items[${i}].hero.cta.label`, message: "Required" });
        }
        if (!isHref(cta.href)) {
            errors.push({
                path: `items[${i}].hero.cta.href`,
                message: "Must start with / or http(s)://",
            });
        }
        if (!Array.isArray(o.sections)) {
            errors.push({ path: `items[${i}].sections`, message: "Must be an array" });
        }
        if (!Array.isArray(o.featured)) {
            errors.push({ path: `items[${i}].featured`, message: "Must be an array" });
        }

        // Best-effort build of the item — bail out on validation errors below.
        items.push({
            label: String(o.label || ""),
            href: String(o.href || ""),
            accent: accent || "primary",
            hero: {
                heading: String(hero.heading || ""),
                description: String(hero.description || ""),
                gradient: String(hero.gradient || "from-primary-500 to-primary-600"),
                imageUrl:
                    typeof hero.imageUrl === "string" && hero.imageUrl
                        ? hero.imageUrl
                        : undefined,
                cta: {
                    label: String(cta.label || ""),
                    href: String(cta.href || o.href || ""),
                },
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
                ? (o.sections as unknown[]).map((s, sIdx) => {
                      const v = (s || {}) as Record<string, unknown>;
                      if (typeof v.heading !== "string" || !v.heading.trim()) {
                          errors.push({
                              path: `items[${i}].sections[${sIdx}].heading`,
                              message: "Required",
                          });
                      }
                      return {
                          heading: String(v.heading || ""),
                          items: Array.isArray(v.items)
                              ? (v.items as unknown[])
                                    .map((it, iIdx) => {
                                        const itv = (it || {}) as Record<string, unknown>;
                                        if (
                                            typeof itv.label !== "string" ||
                                            !itv.label.trim()
                                        ) {
                                            errors.push({
                                                path: `items[${i}].sections[${sIdx}].items[${iIdx}].label`,
                                                message: "Required",
                                            });
                                        }
                                        if (!isHref(itv.href)) {
                                            errors.push({
                                                path: `items[${i}].sections[${sIdx}].items[${iIdx}].href`,
                                                message: "Must start with / or http(s)://",
                                            });
                                        }
                                        return {
                                            label: String(itv.label || ""),
                                            href: String(itv.href || ""),
                                            description:
                                                typeof itv.description === "string"
                                                    ? itv.description
                                                    : undefined,
                                        };
                                    })
                                    .filter((i) => i.label && i.href)
                              : [],
                      };
                  })
                : [],
            featured: Array.isArray(o.featured)
                ? (o.featured as unknown[]).map((f, fIdx) => {
                      const v = (f || {}) as Record<string, unknown>;
                      if (typeof v.title !== "string" || !v.title.trim()) {
                          errors.push({
                              path: `items[${i}].featured[${fIdx}].title`,
                              message: "Required",
                          });
                      }
                      if (!isHref(v.href)) {
                          errors.push({
                              path: `items[${i}].featured[${fIdx}].href`,
                              message: "Must start with / or http(s)://",
                          });
                      }
                      return {
                          title: String(v.title || ""),
                          description: String(v.description || ""),
                          href: String(v.href || ""),
                          gradient: String(v.gradient || "from-primary-500 to-primary-600"),
                          imageUrl:
                              typeof v.imageUrl === "string" && v.imageUrl
                                  ? v.imageUrl
                                  : undefined,
                          badge:
                              typeof v.badge === "string" && v.badge ? v.badge : undefined,
                      };
                  })
                : [],
        });
    });

    if (errors.length > 0) return { ok: false, errors };
    return { ok: true, items };
}

export async function GET(req: NextRequest) {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return withCors(req, auth);

    try {
        const items = await readMegaNavItemsForAdmin();
        return withCors(req, NextResponse.json({ items }));
    } catch (err) {
        console.error("[admin mega-nav GET]", err);
        return withCors(
            req,
            NextResponse.json(
                { error: (err as Error)?.message || "Failed to load" },
                { status: 500 }
            )
        );
    }
}

export async function PUT(req: NextRequest) {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return withCors(req, auth);

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return withCors(
            req,
            NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
        );
    }

    const items = (body as { items?: unknown })?.items;
    const result = validateItems(items);
    if (!result.ok) {
        return withCors(
            req,
            NextResponse.json(
                { error: "Validation failed", details: result.errors },
                { status: 400 }
            )
        );
    }

    try {
        await writeMegaNavItems(result.items);
        return withCors(req, NextResponse.json({ ok: true }));
    } catch (err) {
        console.error("[admin mega-nav PUT]", err);
        return withCors(
            req,
            NextResponse.json(
                { error: (err as Error)?.message || "Save failed" },
                { status: 500 }
            )
        );
    }
}

/**
 * Wipe the Firestore doc so the public header falls back to the code
 * defaults (STATIC_MEGA_NAV). Useful as an "undo" for a bad edit.
 */
export async function DELETE(req: NextRequest) {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return withCors(req, auth);

    try {
        await adminDb.collection("site_config").doc("mega_nav").delete();
        await invalidateCache("site:megaNav:v1");
        return withCors(req, NextResponse.json({ ok: true }));
    } catch (err) {
        console.error("[admin mega-nav DELETE]", err);
        return withCors(
            req,
            NextResponse.json(
                { error: (err as Error)?.message || "Reset failed" },
                { status: 500 }
            )
        );
    }
}

export async function OPTIONS(req: NextRequest) {
    return corsPreflight(req);
}
