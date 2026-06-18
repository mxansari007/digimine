/**
 * Tiny build-time/runtime feature-flag helpers.
 *
 * Flags are plain `NEXT_PUBLIC_*` env vars so the same check works on the
 * server (route handlers, RSC) and in the browser bundle — Next inlines the
 * literal at build time, so a flag that's off compiles to `false` and the
 * gated UI tree shakes / never renders. There's no admin toggle here; flipping
 * a flag is a deploy. Keep flags boolean and short-lived (delete once the
 * feature ships to everyone).
 *
 * A value counts as "on" only for the canonical truthy spellings so a stray
 * `NEXT_PUBLIC_FEATURE_X=0` or an empty string reads as off, not "non-empty
 * string ⇒ true".
 */

/** The truthy spellings we accept for a boolean env flag. */
function envFlag(value: string | undefined): boolean {
    if (!value) return false;
    const v = value.trim().toLowerCase();
    return v === "1" || v === "true" || v === "on" || v === "yes";
}

/**
 * Virtual Lab (gamified live lab session). Gates the student/teacher lab room
 * pages + the live map while the LiveKit/control/agent planes land. Off by
 * default; set `NEXT_PUBLIC_FEATURE_VIRTUAL_LAB=1` to enable.
 *
 * NB: read as a function (not a module-level const) so tests can mutate
 * `process.env` between cases; Next still inlines the underlying literal in the
 * client bundle.
 */
export function isVirtualLabEnabled(): boolean {
    return envFlag(process.env.NEXT_PUBLIC_FEATURE_VIRTUAL_LAB);
}
