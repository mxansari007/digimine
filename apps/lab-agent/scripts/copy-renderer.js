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

// eslint-disable-next-line no-console
console.log("[lab-agent] copied renderer/index.html → dist/renderer/");
