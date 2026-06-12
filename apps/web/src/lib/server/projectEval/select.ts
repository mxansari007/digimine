/**
 * File selection for project evaluation.
 *
 * A fullstack repo is far bigger than any LLM context window, so we
 * filter to candidate-written text files, rank by how much signal a
 * file is likely to carry (entry points, API/auth/db code over leaf
 * components), and truncate to a fixed character budget that the
 * pipeline chunks across analysis calls.
 */
import type { RepoFile } from "./github";

export interface SelectedFile {
    path: string;
    /** UTF-8 content, possibly truncated. */
    content: string;
    truncated: boolean;
}

export interface FileSelection {
    files: SelectedFile[];
    /** Full filtered tree (paths + sizes) for the overview prompt. */
    tree: Array<{ path: string; size: number }>;
    languages: string[];
    hasReadme: boolean;
    /** True when budget limits forced us to drop candidate files. */
    truncated: boolean;
}

const IGNORED_DIRS = new Set([
    "node_modules", ".git", ".github", ".next", ".nuxt", ".svelte-kit", "dist",
    "build", "out", "coverage", "vendor", "__pycache__", ".venv", "venv", "env",
    "target", "bin", "obj", ".idea", ".vscode", ".turbo", ".vercel", "tmp",
    ".cache", "storybook-static", "android", "ios", ".dart_tool", ".expo",
]);

const IGNORED_FILES = new Set([
    "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb",
    "composer.lock", "poetry.lock", "cargo.lock", "gemfile.lock", ".ds_store",
]);

const BINARY_EXTS = new Set([
    "png", "jpg", "jpeg", "gif", "webp", "avif", "ico", "svg", "bmp", "tiff",
    "woff", "woff2", "ttf", "eot", "otf", "mp3", "mp4", "wav", "webm", "ogg",
    "mov", "pdf", "zip", "tar", "gz", "rar", "7z", "jar", "exe", "dll", "so",
    "dylib", "bin", "wasm", "db", "sqlite", "sqlite3", "psd", "ai", "fig",
    "min.js", "min.css", "map", "lock", "pyc", "class", "keystore",
]);

const CODE_EXTS = new Set([
    "js", "jsx", "ts", "tsx", "mjs", "cjs", "vue", "svelte", "py", "rb", "php",
    "java", "kt", "go", "rs", "cs", "sql", "prisma", "graphql", "gql", "html",
    "css", "scss", "json", "yml", "yaml", "toml", "env", "md", "txt", "sh",
    "dockerfile", "ejs", "hbs", "pug",
]);

/** Always-include, read-first files — project identity & wiring. */
const TIER1_PATTERNS: RegExp[] = [
    /(^|\/)package\.json$/i,
    /(^|\/)readme(\.md|\.txt)?$/i,
    /(^|\/)requirements\.txt$/i,
    /(^|\/)pom\.xml$/i,
    /(^|\/)build\.gradle(\.kts)?$/i,
    /(^|\/)docker-compose[^/]*\.ya?ml$/i,
    /(^|\/)dockerfile$/i,
    /(^|\/)schema\.prisma$/i,
    /(^|\/)\.env\.example$/i,
    /(^|\/)(next|vite|nuxt|svelte|remix|astro|tailwind)\.config\.(js|ts|mjs|cjs)$/i,
    /(^|\/)manage\.py$/i,
    /(^|\/)(server|app|index|main)\.(js|ts|py)$/i,
];

/** Path keywords that signal load-bearing fullstack code. */
const SIGNAL_KEYWORDS: Array<[RegExp, number]> = [
    [/(^|\/)(api|routes?|controllers?|handlers?)(\/|\.)/i, 50],
    [/(auth|login|session|jwt|passport|middleware)/i, 45],
    [/(models?|schemas?|entities|prisma|migrations?|db|database)(\/|\.)/i, 40],
    [/(services?|server|backend|lib|utils|helpers?)(\/|\.)/i, 25],
    [/(^|\/)(src|app)(\/|$)/i, 15],
    [/(hooks?|contexts?|store|redux|state)(\/|\.)/i, 12],
    [/(components?|pages?|views?)(\/|\.)/i, 8],
    [/(tests?|__tests__|spec|cypress|e2e)(\/|\.)/i, 10],
];

const EXT_LANGUAGE: Record<string, string> = {
    js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
    ts: "TypeScript", tsx: "TypeScript", vue: "Vue", svelte: "Svelte",
    py: "Python", rb: "Ruby", php: "PHP", java: "Java", kt: "Kotlin",
    go: "Go", rs: "Rust", cs: "C#", sql: "SQL", html: "HTML", css: "CSS",
    scss: "CSS", prisma: "Prisma",
};

export const MAX_SELECTED_FILES = 32;
export const PER_FILE_CHAR_LIMIT = 12_000;
/** Total content budget across all analysis chunks (~55–60K tokens). */
export const TOTAL_CHAR_BUDGET = 230_000;
const MAX_TREE_ENTRIES = 500;

function fileExt(path: string): string {
    const base = path.split("/").pop() || "";
    if (/^dockerfile$/i.test(base)) return "dockerfile";
    const dot = base.lastIndexOf(".");
    return dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
}

function inIgnoredDir(path: string): boolean {
    return path.split("/").slice(0, -1).some((seg) => IGNORED_DIRS.has(seg.toLowerCase()));
}

function looksBinary(buf: Buffer): boolean {
    const probe = buf.subarray(0, 1024);
    for (let i = 0; i < probe.length; i++) {
        if (probe[i] === 0) return true;
    }
    return false;
}

function signalScore(path: string): number {
    let score = 0;
    for (const [re, pts] of SIGNAL_KEYWORDS) {
        if (re.test(path)) score += pts;
    }
    // Shallow files beat deeply nested ones at equal signal.
    score -= path.split("/").length * 2;
    return score;
}

export function selectFiles(all: RepoFile[]): FileSelection {
    const candidates = all.filter((f) => {
        if (inIgnoredDir(f.path)) return false;
        const base = (f.path.split("/").pop() || "").toLowerCase();
        if (IGNORED_FILES.has(base)) return false;
        const ext = fileExt(f.path);
        if (BINARY_EXTS.has(ext)) return false;
        if (base.endsWith(".min.js") || base.endsWith(".min.css")) return false;
        if (f.size === 0 || f.size > 400_000) return false;
        if (ext && !CODE_EXTS.has(ext)) return false;
        if (looksBinary(f.content)) return false;
        return true;
    });

    const langCounts = new Map<string, number>();
    candidates.forEach((f) => {
        const lang = EXT_LANGUAGE[fileExt(f.path)];
        if (lang) langCounts.set(lang, (langCounts.get(lang) || 0) + 1);
    });
    const languages = Array.from(langCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([lang]) => lang);

    const hasReadme = candidates.some((f) => /(^|\/)readme(\.md|\.txt)?$/i.test(f.path));

    const tier1 = candidates.filter((f) => TIER1_PATTERNS.some((re) => re.test(f.path)));
    const rest = candidates
        .filter((f) => !tier1.includes(f))
        .sort((a, b) => signalScore(b.path) - signalScore(a.path));

    const ranked = [...tier1, ...rest];
    const files: SelectedFile[] = [];
    let used = 0;
    for (const f of ranked) {
        if (files.length >= MAX_SELECTED_FILES || used >= TOTAL_CHAR_BUDGET) break;
        const text = f.content.toString("utf8");
        const room = Math.min(PER_FILE_CHAR_LIMIT, TOTAL_CHAR_BUDGET - used);
        const truncated = text.length > room;
        const content = truncated ? text.slice(0, room) : text;
        if (content.trim().length === 0) continue;
        files.push({ path: f.path, content, truncated });
        used += content.length;
    }

    return {
        files,
        tree: candidates
            .slice(0, MAX_TREE_ENTRIES)
            .map((f) => ({ path: f.path, size: f.size })),
        languages,
        hasReadme,
        truncated: ranked.length > files.length,
    };
}
