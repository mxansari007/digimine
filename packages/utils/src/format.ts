/**
 * Format a number as currency
 */
export function formatCurrency(
    amount: number,
    currency: string = "INR",
    locale: string = "en-IN"
): string {
    return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
    }).format(amount);
}

/**
 * Format a date as a localized string
 */
export function formatDate(
    date: Date | string,
    options: Intl.DateTimeFormatOptions = {
        year: "numeric",
        month: "long",
        day: "numeric",
    },
    locale: string = "en-US"
): string {
    const d = typeof date === "string" ? new Date(date) : date;
    return new Intl.DateTimeFormat(locale, options).format(d);
}

/**
 * Format a relative time (e.g., "2 days ago")
 */
export function formatRelativeTime(date: Date | string, locale: string = "en-US"): string {
    const d = typeof date === "string" ? new Date(date) : date;
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - d.getTime()) / 1000);

    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

    if (diffInSeconds < 60) return rtf.format(-diffInSeconds, "second");
    if (diffInSeconds < 3600) return rtf.format(-Math.floor(diffInSeconds / 60), "minute");
    if (diffInSeconds < 86400) return rtf.format(-Math.floor(diffInSeconds / 3600), "hour");
    if (diffInSeconds < 2592000) return rtf.format(-Math.floor(diffInSeconds / 86400), "day");
    if (diffInSeconds < 31536000) return rtf.format(-Math.floor(diffInSeconds / 2592000), "month");
    return rtf.format(-Math.floor(diffInSeconds / 31536000), "year");
}

/**
 * Format file size
 */
export function formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Truncate text with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + "...";
}

/**
 * Generate a URL-safe slug from a string. This is the single canonical
 * implementation — every content creator (quizzes, tests, courses, contests,
 * …) routes through it so slugs are consistent across the whole platform.
 *
 * Rules:
 *   - Unicode accents are folded to ASCII ("Café" → "cafe").
 *   - Any run of non-alphanumeric characters becomes a single hyphen, so
 *     symbols act as word separators ("hello@world" → "hello-world", not
 *     "helloworld"). This matches how the builder forms have always behaved,
 *     keeping existing document IDs stable.
 *   - Leading/trailing hyphens are trimmed.
 *   - The result is capped to `maxLength` without leaving a dangling hyphen.
 *
 * The output always satisfies `isValidSlug`, or is "" for input with no
 * alphanumerics (callers should fall back to a title/default in that case).
 */
export function slugify(text: string, maxLength = 80): string {
    const base = (text || "")
        // Split accented chars into base letter + combining mark, then drop
        // the marks. e.g. "é" → "e", "ñ" → "n".
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        // Any run of non-alphanumerics (spaces, underscores, symbols) → one hyphen.
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    if (base.length <= maxLength) return base;
    // Trim to the cap, then strip a hyphen the cut may have left dangling.
    return base.slice(0, maxLength).replace(/-+$/g, "");
}
