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
 * Generate a slug from a string
 */
export function slugify(text: string): string {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/[\s_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
}
