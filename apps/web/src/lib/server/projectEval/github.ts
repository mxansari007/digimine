/**
 * GitHub repo fetcher for project evaluation.
 *
 * Downloads a public repo as a tarball from codeload.github.com (a single
 * unauthenticated request — avoids the 60 req/h REST rate limit) and
 * parses the tar in memory. No git binary, no filesystem writes, no
 * extra dependencies (tar headers are parsed by hand — the format is a
 * sequence of 512-byte USTAR headers).
 */
import { gunzipSync } from "node:zlib";

export interface ParsedRepoUrl {
    owner: string;
    repo: string;
    /** Branch/tag from a /tree/<ref> URL; null = default branch. */
    ref: string | null;
}

export interface RepoFile {
    /** Path relative to repo root (leading `<repo>-<sha>/` stripped). */
    path: string;
    size: number;
    content: Buffer;
}

export interface RepoCommitInfo {
    commitCount: number | null;
    lastCommitAt: string | null;
    defaultBranch: string | null;
}

/** Compressed-download cap — repos beyond this are rejected, not truncated. */
const MAX_TARBALL_BYTES = 30 * 1024 * 1024;
/** Uncompressed safety cap (zip-bomb guard). */
const MAX_EXTRACTED_BYTES = 120 * 1024 * 1024;
const MAX_FILES = 6000;
const FETCH_TIMEOUT_MS = 45_000;

const SAFE_SEGMENT = /^[A-Za-z0-9_.-]+$/;

/**
 * Accepts https://github.com/{owner}/{repo}, optional .git suffix,
 * optional /tree/{ref}. Returns null for anything else (SSRF guard —
 * owner/repo are interpolated into the codeload URL).
 */
export function parseGitHubUrl(input: string): ParsedRepoUrl | null {
    let url: URL;
    try {
        url = new URL(input.trim());
    } catch {
        return null;
    }
    if (!/^(www\.)?github\.com$/i.test(url.hostname)) return null;
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length < 2) return null;
    const owner = segments[0];
    const repo = segments[1].replace(/\.git$/i, "");
    if (!SAFE_SEGMENT.test(owner) || !SAFE_SEGMENT.test(repo)) return null;
    let ref: string | null = null;
    if (segments[2] === "tree" && segments.length >= 4) {
        // Branch names may contain `/` — keep the remaining segments.
        const raw = segments.slice(3).join("/");
        if (!/^[A-Za-z0-9_./-]+$/.test(raw) || raw.includes("..")) return null;
        ref = raw;
    }
    return { owner, repo, ref };
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Download the repo tarball. Tries the requested ref, then HEAD (default
 * branch). Throws a student-readable Error on failure.
 */
export async function downloadRepoTarball(parsed: ParsedRepoUrl): Promise<Buffer> {
    const refs = parsed.ref ? [parsed.ref, "HEAD"] : ["HEAD"];
    let lastStatus = 0;
    for (const ref of refs) {
        const url = `https://codeload.github.com/${parsed.owner}/${parsed.repo}/tar.gz/${encodeURIComponent(ref)}`;
        const res = await fetchWithTimeout(url, {
            headers: { "User-Agent": "PlacementRanker-ProjectEval" },
        });
        if (!res.ok) {
            lastStatus = res.status;
            continue;
        }
        const declared = Number(res.headers.get("content-length") || 0);
        if (declared > MAX_TARBALL_BYTES) {
            throw new Error(
                `Repository is too large to evaluate (max ${Math.round(MAX_TARBALL_BYTES / 1024 / 1024)}MB download).`
            );
        }
        // Stream with a running cap — content-length is often absent on codeload.
        const reader = res.body?.getReader();
        if (!reader) throw new Error("Could not read repository download stream.");
        const chunks: Buffer[] = [];
        let total = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > MAX_TARBALL_BYTES) {
                reader.cancel().catch(() => {});
                throw new Error(
                    `Repository is too large to evaluate (max ${Math.round(MAX_TARBALL_BYTES / 1024 / 1024)}MB download).`
                );
            }
            chunks.push(Buffer.from(value));
        }
        return Buffer.concat(chunks);
    }
    if (lastStatus === 404) {
        throw new Error(
            "Repository not found. Make sure the URL is correct and the repository is PUBLIC."
        );
    }
    throw new Error(`Could not download the repository (GitHub returned ${lastStatus || "no response"}).`);
}

/** Parse a gzipped tarball into file entries, root directory stripped. */
export function extractTarball(tarballGz: Buffer): RepoFile[] {
    let tar: Buffer;
    try {
        tar = gunzipSync(tarballGz, { maxOutputLength: MAX_EXTRACTED_BYTES });
    } catch {
        throw new Error("Repository archive could not be unpacked (too large or corrupted).");
    }

    const files: RepoFile[] = [];
    let offset = 0;
    let pendingLongName: string | null = null;
    let extractedBytes = 0;

    while (offset + 512 <= tar.length) {
        const header = tar.subarray(offset, offset + 512);
        // Two consecutive zero blocks terminate the archive.
        if (header.every((b) => b === 0)) break;

        const nameRaw = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
        const sizeOctal = header.subarray(124, 136).toString("utf8").replace(/[^0-7]/g, "");
        const size = parseInt(sizeOctal || "0", 8) || 0;
        const typeFlag = String.fromCharCode(header[156]);
        const prefix = header.subarray(345, 500).toString("utf8").replace(/\0.*$/, "");

        const dataStart = offset + 512;
        const dataEnd = dataStart + size;
        offset = dataStart + Math.ceil(size / 512) * 512;
        if (dataEnd > tar.length) break;

        // GNU long-name entry: payload is the real name of the NEXT entry.
        if (typeFlag === "L") {
            pendingLongName = tar.subarray(dataStart, dataEnd).toString("utf8").replace(/\0.*$/, "");
            continue;
        }

        let fullName = pendingLongName ?? (prefix ? `${prefix}/${nameRaw}` : nameRaw);
        pendingLongName = null;

        // Regular files only ("0" or NUL).
        if (typeFlag !== "0" && typeFlag !== "\0") continue;
        // Strip the `<repo>-<ref>/` root directory codeload adds.
        const slash = fullName.indexOf("/");
        if (slash < 0) continue;
        fullName = fullName.slice(slash + 1);
        if (!fullName || fullName.includes("..")) continue;

        extractedBytes += size;
        if (extractedBytes > MAX_EXTRACTED_BYTES || files.length >= MAX_FILES) {
            break;
        }
        files.push({ path: fullName, size, content: tar.subarray(dataStart, dataEnd) });
    }
    if (files.length === 0) {
        throw new Error("The repository appears to be empty.");
    }
    return files;
}

/**
 * Best-effort repo metadata from the GitHub REST API. Unauthenticated
 * calls share a 60 req/h per-IP budget, so failures (rate limit, private
 * repo) degrade to nulls instead of failing the evaluation. Set
 * GITHUB_TOKEN to raise the limit.
 */
export async function fetchRepoCommitInfo(parsed: ParsedRepoUrl): Promise<RepoCommitInfo> {
    const headers: Record<string, string> = {
        "User-Agent": "PlacementRanker-ProjectEval",
        Accept: "application/vnd.github+json",
    };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

    const out: RepoCommitInfo = { commitCount: null, lastCommitAt: null, defaultBranch: null };
    try {
        const repoRes = await fetchWithTimeout(
            `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`,
            { headers }
        );
        if (repoRes.ok) {
            const json = await repoRes.json();
            out.defaultBranch = typeof json?.default_branch === "string" ? json.default_branch : null;
        }
        const commitsRes = await fetchWithTimeout(
            `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/commits?per_page=1${parsed.ref ? `&sha=${encodeURIComponent(parsed.ref)}` : ""}`,
            { headers }
        );
        if (commitsRes.ok) {
            const list = await commitsRes.json();
            const date = list?.[0]?.commit?.committer?.date || list?.[0]?.commit?.author?.date;
            out.lastCommitAt = typeof date === "string" ? date : null;
            // Total count comes from the `last` page number in the Link header.
            const link = commitsRes.headers.get("link") || "";
            const m = link.match(/[?&]page=(\d+)>;\s*rel="last"/);
            out.commitCount = m ? parseInt(m[1], 10) : Array.isArray(list) ? list.length : null;
        }
    } catch {
        // Metadata is a nice-to-have; never fail the evaluation over it.
    }
    return out;
}
