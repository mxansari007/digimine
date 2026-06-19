/**
 * Copy the renderer's static assets (index.html) into dist/renderer/ next to
 * the compiled renderer.js, so Electron's `loadFile` finds a self-contained
 * bundle in both dev and a packaged app.
 *
 * tsc compiles src/renderer/renderer.ts → dist/renderer/renderer.js; this just
 * carries the HTML across (tsc won't copy non-TS files).
 */
const fs = require("fs");
const path = require("path");

const srcDir = path.join(__dirname, "..", "src", "renderer");
const outDir = path.join(__dirname, "..", "dist", "renderer");

fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(
  path.join(srcDir, "index.html"),
  path.join(outDir, "index.html")
);

// Carry the app icon next to the compiled main.js so the tray + window can load
// it at runtime (dev AND packaged — build.files includes dist/**). Best-effort:
// the agent still runs with a blank icon if build/icon.png is missing.
try {
  fs.copyFileSync(
    path.join(__dirname, "..", "build", "icon.png"),
    path.join(__dirname, "..", "dist", "icon.png")
  );
  // eslint-disable-next-line no-console
  console.log("[lab-agent] copied build/icon.png → dist/");
} catch {
  // eslint-disable-next-line no-console
  console.log("[lab-agent] note: no build/icon.png — tray/window will use a blank icon");
}

// eslint-disable-next-line no-console
console.log("[lab-agent] copied renderer/index.html → dist/renderer/");
