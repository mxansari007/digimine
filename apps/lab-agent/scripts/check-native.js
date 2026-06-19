/**
 * postinstall notice for the native input backend.
 *
 * `@nut-tree-fork/nut-js` (the mouse/keyboard injection backend) ships prebuilt
 * N-API binaries (libnut-darwin on macOS, libnut-win32 on Windows). N-API is
 * ABI-stable across Node and Electron, so these load in this project's Electron
 * as-is — there is NO native rebuild step. (`npm run rebuild` / electron-rebuild
 * is a harmless no-op here: "No native modules found".)
 *
 * This script is intentionally non-fatal: nut-js is an OPTIONAL dependency, so
 * screen-sharing must keep working even when it is absent. We only print status.
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
    ? "[lab-agent] native input backend present (N-API, no rebuild needed) — remote control enabled."
    : "[lab-agent] native input backend not installed — remote control is disabled (screen-sharing still works). See README → 'Remote control / native input'."
);
