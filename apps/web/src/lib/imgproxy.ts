/**
 * Build imgproxy URLs for the public site.
 *
 * Usage:
 *   imgproxyUrl(course.thumbnailURL, { width: 800, height: 450, format: "webp" })
 *
 * Behavior:
 *   - When `NEXT_PUBLIC_IMGPROXY_URL` is unset (local dev, fallback), the
 *     helper returns the original `source` unchanged so nothing breaks.
 *   - When `IMGPROXY_KEY` + `IMGPROXY_SALT` are set on the server, URLs are
 *     HMAC-signed (server-only). Otherwise the `insecure` placeholder is used
 *     and you rely on `IMGPROXY_ALLOWED_SOURCES` on the imgproxy side plus
 *     Cloudflare in front for rate limiting.
 *   - Empty / non-HTTP sources (`data:`, `blob:`, empty string) pass through.
 *
 * SEO note: imgproxy converts to AVIF/WebP, slashes byte sizes, and improves
 * LCP — which Google ranks on. Pair with Cloudflare caching so each unique URL
 * is transformed at most once.
 */

const HOST = (process.env.NEXT_PUBLIC_IMGPROXY_URL || "").replace(/\/$/, "");

// Signing keys are SERVER-ONLY. In the browser these will be undefined and the
// helper falls back to `insecure` (which is fine when imgproxy enforces
// IMGPROXY_ALLOWED_SOURCES).
const KEY_HEX = typeof process !== "undefined" ? process.env.IMGPROXY_KEY || "" : "";
const SALT_HEX = typeof process !== "undefined" ? process.env.IMGPROXY_SALT || "" : "";

export type ImgproxyOpts = {
    /** Target width (0 = auto). Default: source width. */
    width?: number;
    /** Target height (0 = auto). Default: source height. */
    height?: number;
    /** "fit" preserves aspect ratio inside box; "fill" crops; "auto" picks. */
    fit?: "fit" | "fill" | "auto";
    /** Output format. Default: webp. */
    format?: "webp" | "avif" | "jpg" | "png";
    /** 1–100. Default: 82 (imgproxy default). */
    quality?: number;
    /** "smart" focuses on the most salient region when cropping. */
    gravity?: "ce" | "smart" | "no" | "so" | "ea" | "we";
    /** Enlarge smaller-than-target images. Defaults to false. */
    enlarge?: boolean;
};

function toBase64Url(input: string): string {
    if (typeof window !== "undefined" && typeof btoa === "function") {
        return btoa(input).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
    }
    // Node / SSR
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Buffer } = require("buffer") as typeof import("buffer");
    return Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function sign(path: string): string {
    if (!KEY_HEX || !SALT_HEX) return "insecure";
    try {
        // SSR-only: require crypto without breaking the client bundle.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { createHmac, Buffer } = require("crypto") as typeof import("crypto") & { Buffer: typeof globalThis.Buffer };
        const key = Buffer.from(KEY_HEX, "hex");
        const salt = Buffer.from(SALT_HEX, "hex");
        const hmac = createHmac("sha256", key);
        hmac.update(salt);
        hmac.update(path);
        return hmac.digest("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
    } catch {
        return "insecure";
    }
}

/**
 * Return an imgproxy URL for `source`, or `source` unchanged if imgproxy isn't
 * configured. Safe to call from anywhere — server components, client
 * components, or RSC.
 */
export function imgproxyUrl(source: string | null | undefined, opts: ImgproxyOpts = {}): string {
    const src = (source || "").trim();
    if (!src) return src;
    if (!HOST) return src; // imgproxy not configured → pass through
    if (src.startsWith("data:") || src.startsWith("blob:")) return src;
    if (!/^https?:\/\//i.test(src)) return src;

    const fit = opts.fit || "fit";
    const w = Math.max(0, Math.round(opts.width ?? 0));
    const h = Math.max(0, Math.round(opts.height ?? 0));
    const enlarge = opts.enlarge ? 1 : 0;
    const q = Math.max(1, Math.min(100, Math.round(opts.quality ?? 82)));
    const fmt = opts.format || "webp";
    const gravity = opts.gravity || "smart";

    const parts = [`rs:${fit}:${w}:${h}:${enlarge}`, `g:${gravity}`, `q:${q}`];
    const processing = parts.join("/");

    const encoded = toBase64Url(src);
    const path = `/${processing}/${encoded}.${fmt}`;
    const sig = sign(path);
    return `${HOST}/${sig}${path}`;
}

/** Convenience presets to keep call sites tidy. */
export const imgPresets = {
    thumb: (src?: string | null) => imgproxyUrl(src, { width: 480, height: 270, fit: "fill", format: "webp", quality: 78 }),
    cardCover: (src?: string | null) => imgproxyUrl(src, { width: 800, height: 450, fit: "fill", format: "webp", quality: 82 }),
    heroCover: (src?: string | null) => imgproxyUrl(src, { width: 1600, height: 900, fit: "fill", format: "webp", quality: 84 }),
    ogImage: (src?: string | null) => imgproxyUrl(src, { width: 1200, height: 630, fit: "fill", format: "jpg", quality: 85 }),
    avatar: (src?: string | null, size = 96) => imgproxyUrl(src, { width: size, height: size, fit: "fill", format: "webp", quality: 80 }),
};
