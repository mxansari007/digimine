/**
 * Dynamic OG image generator.
 *
 *   GET /api/og?title=...&subtitle=...&category=...&accent=blue&stats=DURATION:180+min,SECTIONS:4
 *
 * Renders a 1200×630 branded PNG on the Edge. Same query string always
 * yields the same image, so the response is marked `immutable` and gets
 * pinned at the Vercel edge — Facebook/X/WhatsApp/LinkedIn cache it once
 * and forever.
 *
 * Used for:
 *   - Articles (auto cover when `coverImageUrl` is blank)
 *   - Practice problems / pattern landing pages
 *   - Mock tests, courses, contests — any page that needs a share card
 *
 * On imgproxy: this route emits PNG directly. Social platforms request
 * the URL with their own user-agents, so funnelling through imgproxy adds
 * latency without saving bytes. For embedded thumbnails on internal pages,
 * keep using `imgproxyUrl(...)` as before — this route is purely for
 * social/open-graph use.
 */
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";
export const revalidate = false;

// Inter (latin) from the @fontsource CDN — stable, hash-pinned files, no
// rate limits. Fetched once per warm edge instance.
const INTER_500_URL =
    "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.18/files/inter-latin-500-normal.woff";
const INTER_700_URL =
    "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.18/files/inter-latin-700-normal.woff";

async function loadFont(url: string): Promise<ArrayBuffer> {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) throw new Error(`Failed to fetch font (${res.status}): ${url}`);
    return res.arrayBuffer();
}

// ── Accent palettes ──────────────────────────────────────────────────
// `blue` is the default (matches PlacementRanker's primary blue). Use
// `amber` for premium/featured, `green` for SQL / mastery content,
// `rose` for time-sensitive (cutoffs, deadlines).
type Accent = "blue" | "green" | "amber" | "rose" | "slate";

const ACCENTS: Record<Accent, {
    bg: string;
    cardSolid: string;
    accent: string;
    cardSolidLabel: string;
    brandDot: string;
}> = {
    blue: {
        bg: "#eff6ff",
        cardSolid: "#1e3a8a",
        accent: "#1e40af",
        cardSolidLabel: "#bfdbfe",
        brandDot: "#1e40af",
    },
    green: {
        bg: "#ecfdf5",
        cardSolid: "#065f46",
        accent: "#047857",
        cardSolidLabel: "#a7f3d0",
        brandDot: "#059669",
    },
    amber: {
        bg: "#fffbeb",
        cardSolid: "#92400e",
        accent: "#b45309",
        cardSolidLabel: "#fde68a",
        brandDot: "#d97706",
    },
    rose: {
        bg: "#fff1f2",
        cardSolid: "#9f1239",
        accent: "#be123c",
        cardSolidLabel: "#fecdd3",
        brandDot: "#e11d48",
    },
    slate: {
        bg: "#f8fafc",
        cardSolid: "#0f172a",
        accent: "#334155",
        cardSolidLabel: "#cbd5e1",
        brandDot: "#475569",
    },
};

function parseStats(raw: string | null): Array<{ label: string; value: string }> {
    if (!raw) return [];
    return raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((pair) => {
            const idx = pair.indexOf(":");
            if (idx < 0) return { label: pair.toUpperCase(), value: "" };
            return {
                label: pair.slice(0, idx).trim().toUpperCase(),
                value: pair.slice(idx + 1).trim(),
            };
        })
        .filter((s) => s.label || s.value)
        .slice(0, 4);
}

function truncate(s: string, n: number): string {
    if (!s || s.length <= n) return s;
    return s.slice(0, n - 1).trimEnd() + "…";
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);

        const title = truncate(searchParams.get("title") || "PlacementRanker", 95);
        const subtitle = truncate(searchParams.get("subtitle") || "", 130);
        const category = (searchParams.get("category") || "").slice(0, 40);
        const accentParam = (searchParams.get("accent") || "blue") as Accent;
        const c = ACCENTS[accentParam] || ACCENTS.blue;
        const stats = parseStats(searchParams.get("stats"));

        const [inter500, inter700] = await Promise.all([
            loadFont(INTER_500_URL),
            loadFont(INTER_700_URL),
        ]);

        return new ImageResponse(
            (
                <div
                    style={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        backgroundColor: c.bg,
                        backgroundImage:
                            "radial-gradient(circle at 1px 1px, rgba(30, 64, 175, 0.16) 1px, transparent 0)",
                        backgroundSize: "22px 22px",
                        padding: "60px 70px",
                        position: "relative",
                        fontFamily: "Inter",
                    }}
                >
                    {/* Decorative circles */}
                    <div
                        style={{
                            position: "absolute",
                            top: -120,
                            right: -90,
                            width: 280,
                            height: 280,
                            borderRadius: "50%",
                            backgroundColor: c.accent,
                            opacity: 0.1,
                            display: "flex",
                        }}
                    />
                    <div
                        style={{
                            position: "absolute",
                            bottom: -140,
                            left: -110,
                            width: 320,
                            height: 320,
                            borderRadius: "50%",
                            backgroundColor: c.accent,
                            opacity: 0.08,
                            display: "flex",
                        }}
                    />

                    {/* Top row: brand pill + category chip */}
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 16,
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 12,
                                backgroundColor: "#ffffff",
                                borderRadius: 12,
                                padding: "10px 18px 10px 12px",
                                border: "1px solid #cbd5e1",
                            }}
                        >
                            <div
                                style={{
                                    width: 34,
                                    height: 34,
                                    borderRadius: 8,
                                    backgroundColor: c.brandDot,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    color: "#fff",
                                    fontWeight: 700,
                                    fontSize: 18,
                                }}
                            >
                                P
                            </div>
                            <div style={{ display: "flex", flexDirection: "column" }}>
                                <div
                                    style={{
                                        fontWeight: 700,
                                        fontSize: 18,
                                        color: "#0f172a",
                                        lineHeight: 1,
                                    }}
                                >
                                    PlacementRanker
                                </div>
                                <div
                                    style={{
                                        fontSize: 12,
                                        color: "#64748b",
                                        marginTop: 4,
                                        lineHeight: 1,
                                    }}
                                >
                                    placementranker.com
                                </div>
                            </div>
                        </div>

                        {category && (
                            <div
                                style={{
                                    backgroundColor: c.cardSolid,
                                    color: "#ffffff",
                                    borderRadius: 999,
                                    padding: "10px 22px",
                                    fontSize: 14,
                                    fontWeight: 700,
                                    letterSpacing: 1.2,
                                    display: "flex",
                                }}
                            >
                                {category.toUpperCase()}
                            </div>
                        )}
                    </div>

                    {/* Title */}
                    <div
                        style={{
                            display: "flex",
                            fontSize: title.length > 60 ? 56 : 68,
                            fontWeight: 700,
                            color: "#0f172a",
                            marginTop: 56,
                            lineHeight: 1.08,
                            letterSpacing: -1.2,
                        }}
                    >
                        {title}
                    </div>

                    {/* Subtitle */}
                    {subtitle && (
                        <div
                            style={{
                                display: "flex",
                                fontSize: 26,
                                fontWeight: 500,
                                color: c.accent,
                                marginTop: 18,
                                lineHeight: 1.32,
                            }}
                        >
                            {subtitle}
                        </div>
                    )}

                    {/* Stats row (optional) — last card uses the solid accent */}
                    {stats.length > 0 ? (
                        <div
                            style={{
                                display: "flex",
                                gap: 14,
                                marginTop: "auto",
                            }}
                        >
                            {stats.map((s, i) => {
                                const isHighlight = i === stats.length - 1 && stats.length > 1;
                                return (
                                    <div
                                        key={i}
                                        style={{
                                            flex: 1,
                                            backgroundColor: isHighlight ? c.cardSolid : "#ffffff",
                                            borderRadius: 14,
                                            padding: "20px 22px",
                                            display: "flex",
                                            flexDirection: "column",
                                            border: isHighlight ? "none" : "1px solid #cbd5e1",
                                            minWidth: 0,
                                        }}
                                    >
                                        <div
                                            style={{
                                                fontSize: 12,
                                                fontWeight: 700,
                                                color: isHighlight ? c.cardSolidLabel : "#64748b",
                                                letterSpacing: 1.2,
                                            }}
                                        >
                                            {s.label}
                                        </div>
                                        <div
                                            style={{
                                                fontSize: 30,
                                                fontWeight: 700,
                                                color: isHighlight ? "#ffffff" : "#0f172a",
                                                marginTop: 8,
                                                lineHeight: 1.05,
                                            }}
                                        >
                                            {s.value}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div
                            style={{
                                display: "flex",
                                marginTop: "auto",
                                fontSize: 18,
                                color: c.accent,
                                fontWeight: 700,
                                letterSpacing: 0.4,
                            }}
                        >
                            Read the full guide →
                        </div>
                    )}
                </div>
            ),
            {
                width: 1200,
                height: 630,
                fonts: [
                    { name: "Inter", data: inter500, weight: 500, style: "normal" },
                    { name: "Inter", data: inter700, weight: 700, style: "normal" },
                ],
                headers: {
                    // Same params yield byte-identical image → safe to cache forever.
                    // Vercel edge + every social-platform cache will pin it.
                    "Cache-Control":
                        "public, immutable, no-transform, max-age=31536000",
                },
            }
        );
    } catch (err) {
        console.error("[/api/og] generation failed:", err);
        return new Response(`OG generation failed: ${(err as Error).message}`, {
            status: 500,
        });
    }
}
