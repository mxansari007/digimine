/**
 * postinstall notice for the native input backend.
 *
 * nut-js ships prebuilt N-API binaries, but they target a stock Node ABI — not
 * Electron's bundled Node. Remote control therefore needs a native rebuild
 * against this project's Electron version:
 *
 *     npx @electron/rebuild -f -w @nut-tree-fork/nut-js
 *
 * This script is intentionally non-fatal: nut-js is an OPTIONAL dependency, so
 * screen-sharing must keep working even when it (or its rebuild) is absent. We
 * only print guidance.
 */
let present = false;
try {
  require.resolve("@nut-tree-fork/nut-js");
  present = true;
} catch {
  present = false;
}

// eslint-disable-next-line no-console
console.log(
  present
    ? "[lab-agent] native input backend present — run `npx @electron/rebuild -f -w @nut-tree-fork/nut-js` to enable remote control for this Electron ABI."
    : "[lab-agent] native input backend not installed — remote control is disabled (screen-sharing still works). See README → 'Remote control / native input'."
);
