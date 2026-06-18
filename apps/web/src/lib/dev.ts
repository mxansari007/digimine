/**
 * Development / localhost detection helpers.
 *
 * These are used to relax policies (e.g. email verification) when the app is
 * running locally, without requiring manual env-var toggles. They must NEVER
 * be used to weaken security in production.
 */

/**
 * True when running in a browser on localhost or 127.0.0.1.
 * Safe to call from client components.
 */
export function isLocalhost(): boolean {
    if (typeof window === "undefined") return false;
    const host = window.location.hostname;
    return host === "localhost" || host === "127.0.0.1";
}

/**
 * True when a server-side Request appears to come from a localhost origin
 * or referer. Used as an extra signal for dev-only relaxations.
 */
export function isLocalhostRequest(req: Request): boolean {
    const origin = req.headers.get("origin") || "";
    const referer = req.headers.get("referer") || "";
    return (
        origin.includes("localhost") ||
        origin.includes("127.0.0.1") ||
        referer.includes("localhost") ||
        referer.includes("127.0.0.1")
    );
}
