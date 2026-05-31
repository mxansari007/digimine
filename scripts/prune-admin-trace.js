#!/usr/bin/env node
/**
 * Pre-build prune for the ADMIN app only.
 *
 * Why: the admin app is 100% client components, but its dynamic [id] edit
 * routes still compile to Node serverless functions, so `next build` runs the
 * "Collecting build traces" (nft) step. nft walks/globs the monorepo
 * node_modules root, which contains onnxruntime-node (~208 MB of native
 * GPU/CUDA/TensorRT binaries) and other heavy native packages pulled in by the
 * WEB app's TTS stack. On Vercel's 2-core / 8 GB build machine this exhausts
 * memory and the build hangs forever at "Collecting build traces ...".
 *
 * The admin app never imports any of these packages (they're web-app-only), and
 * Turbo builds ONLY @digimine/admin in this job, so deleting them from the pnpm
 * store before the trace is safe and makes the trace fast + memory-light.
 *
 * Idempotent and non-fatal: missing dirs are ignored. Runs from apps/admin so
 * the monorepo root is two levels up.
 */
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(process.cwd(), "../../");
const pnpmDir = path.join(repoRoot, "node_modules", ".pnpm");

// Heavy native packages the admin trace never needs. Matched as a prefix of the
// .pnpm/<pkg@ver> directory name (pnpm flattens scoped names with a '+').
const HEAVY_PREFIXES = [
    "onnxruntime-node@",
    "onnxruntime-web@",
    "onnxruntime-common@",
    "kokoro-js@",
    "sharp@",
    "@img+",
    "@huggingface+",
    "@xenova+",
];

function rmrf(target) {
    try {
        fs.rmSync(target, { recursive: true, force: true });
        return true;
    } catch {
        return false;
    }
}

if (!fs.existsSync(pnpmDir)) {
    console.log(`[prune-admin-trace] no .pnpm store at ${pnpmDir} — skipping`);
    process.exit(0);
}

let removed = 0;
let freedNote = [];
for (const entry of fs.readdirSync(pnpmDir)) {
    if (HEAVY_PREFIXES.some((p) => entry.startsWith(p))) {
        const full = path.join(pnpmDir, entry);
        if (rmrf(full)) {
            removed++;
            freedNote.push(entry);
        }
    }
}

console.log(
    `[prune-admin-trace] removed ${removed} heavy native package(s) from the store before tracing:` +
    (freedNote.length ? "\n  - " + freedNote.join("\n  - ") : " (none present)")
);
process.exit(0);
