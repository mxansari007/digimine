/** Tiny dotted-path get/set for ResumeData (numeric segments = array indices).
 *  Used to map an inline-edited element's `data-rz-edit` path back to the data. */

export function getByPath(obj: unknown, path: string): unknown {
    return path
        .split(".")
        .reduce<unknown>(
            (o, k) =>
                o == null ? o : (o as Record<string, unknown>)[/^\d+$/.test(k) ? Number(k) : (k as never)],
            obj
        );
}

export function setByPath<T>(obj: T, path: string, value: unknown): T {
    const keys = path.split(".");
    const clone = structuredClone(obj) as Record<string, unknown>;
    let cur: Record<string, unknown> = clone;
    for (let i = 0; i < keys.length - 1; i++) {
        const k = /^\d+$/.test(keys[i]) ? Number(keys[i]) : keys[i];
        const next = cur[k as never];
        if (next == null || typeof next !== "object") return clone as T;
        cur = next as Record<string, unknown>;
    }
    const last = keys[keys.length - 1];
    cur[(/^\d+$/.test(last) ? Number(last) : last) as never] = value;
    return clone as T;
}
