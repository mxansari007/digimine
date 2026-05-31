/**
 * Recursively convert Firestore admin `Timestamp` (and `Date`) values to ISO
 * strings so a document can be safely JSON-serialized to the client. The admin
 * pages parse dates with `formatDate(Date | string)` from @digimine/utils, so
 * ISO strings are a drop-in for the `Date` objects the client SDK used to map.
 */
export function serializeTimestamps<T = unknown>(value: T): T {
    if (value == null) return value;
    // Firestore Timestamp (admin or client) exposes toDate().
    const maybeTs = value as unknown as { toDate?: () => Date };
    if (typeof maybeTs.toDate === "function") {
        try {
            return maybeTs.toDate().toISOString() as unknown as T;
        } catch {
            return null as unknown as T;
        }
    }
    if (value instanceof Date) return value.toISOString() as unknown as T;
    if (Array.isArray(value)) return value.map((v) => serializeTimestamps(v)) as unknown as T;
    if (typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(value as Record<string, unknown>)) {
            out[key] = serializeTimestamps((value as Record<string, unknown>)[key]);
        }
        return out as T;
    }
    return value;
}
