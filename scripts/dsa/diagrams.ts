/**
 * Diagram toolkit for DSA course content.
 *
 * Two engines:
 *  1. Hand-authored parametric SVG — for box-and-pointer visuals (arrays,
 *     linked lists, stacks, queues, grids, charts) where precise layout matters.
 *  2. GraphViz `dot` — for trees and graphs (auto-layout).
 *
 * Everything returns a self-contained <figure> of inline SVG that drops straight
 * into a subtopic's contentHtml. FormattedContent passes <svg> through untouched
 * (it only strips script/style/object/embed/form + on* handlers), so no image
 * hosting is needed. Inline `style="..."` attributes survive the sanitizer.
 *
 * Palette (reads well on the white content card):
 *   ink #0f172a · slate line #475569 · muted #64748b · faint fill #f8fafc
 *   teal #0d9488 (accent) · teal fill #f0fdfa · amber #f59e0b · red #ef4444
 */
import { execSync } from "child_process";

const DOT = "/opt/homebrew/bin/dot";

const C = {
    ink: "#0f172a",
    line: "#475569",
    muted: "#64748b",
    faint: "#f8fafc",
    border: "#cbd5e1",
    teal: "#0d9488",
    tealFill: "#f0fdfa",
    amber: "#f59e0b",
    amberFill: "#fffbeb",
    red: "#ef4444",
    redFill: "#fef2f2",
};

const FONT = "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

export function esc(s: string): string {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Wrap raw SVG markup (without the <svg> tag) in a responsive, captioned figure. */
export function fig(svg: string, caption?: string, maxW = 560): string {
    const cap = caption
        ? `<figcaption style="margin-top:.55rem;font-size:.78rem;line-height:1.5;color:${C.muted}">${caption}</figcaption>`
        : "";
    return `<figure style="margin:1.5rem auto;text-align:center;max-width:${maxW}px">${svg}${cap}</figure>`;
}

function svgEl(w: number, h: number, body: string): string {
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" style="max-width:${w}px;height:auto;font-family:${esc(FONT)}" xmlns="http://www.w3.org/2000/svg" role="img">${body}</svg>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. ARRAY — contiguous cells with optional indices, highlights, and pointers
// ─────────────────────────────────────────────────────────────────────────────
type ArrayOpts = {
    indices?: boolean;
    highlight?: number[];        // teal-filled cells
    range?: [number, number];    // inclusive range underline (window)
    pointers?: { i: number; label: string; color?: "teal" | "amber" | "red" }[];
    caption?: string;
    cell?: number;
};
export function arrayDiagram(values: (string | number)[], opts: ArrayOpts = {}): string {
    const cw = opts.cell ?? 46;
    const ch = 44;
    const padX = 14;
    const ptrH = opts.pointers && opts.pointers.length ? 40 : 0;
    const idxH = opts.indices ? 22 : 0;
    const rangeH = opts.range ? 16 : 0;
    const n = values.length;
    const w = padX * 2 + n * cw;
    const top = ptrH + 8;
    const h = top + ch + idxH + rangeH + 6;
    const hi = new Set(opts.highlight ?? []);
    let body = "";

    // pointers above
    for (const p of opts.pointers ?? []) {
        const col = p.color === "amber" ? C.amber : p.color === "red" ? C.red : C.teal;
        const x = padX + p.i * cw + cw / 2;
        body += `<text x="${x}" y="14" text-anchor="middle" font-size="12" font-weight="700" fill="${col}">${esc(p.label)}</text>`;
        body += `<line x1="${x}" y1="20" x2="${x}" y2="${top - 2}" stroke="${col}" stroke-width="1.6"/>`;
        body += `<path d="M${x - 4},${top - 8} L${x},${top - 1} L${x + 4},${top - 8} Z" fill="${col}"/>`;
    }
    // cells
    for (let i = 0; i < n; i++) {
        const x = padX + i * cw;
        const filled = hi.has(i);
        body += `<rect x="${x}" y="${top}" width="${cw}" height="${ch}" fill="${filled ? C.tealFill : "#ffffff"}" stroke="${filled ? C.teal : C.border}" stroke-width="${filled ? 1.8 : 1.2}"/>`;
        body += `<text x="${x + cw / 2}" y="${top + ch / 2 + 5}" text-anchor="middle" font-size="15" font-weight="600" fill="${C.ink}">${esc(String(values[i]))}</text>`;
        if (opts.indices) body += `<text x="${x + cw / 2}" y="${top + ch + 16}" text-anchor="middle" font-size="11" fill="${C.muted}" font-family="${esc(MONO)}">${i}</text>`;
    }
    // range underline
    if (opts.range) {
        const [a, b] = opts.range;
        const x1 = padX + a * cw, x2 = padX + (b + 1) * cw;
        const y = top + ch + idxH + 8;
        body += `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${C.teal}" stroke-width="2.5" stroke-linecap="round"/>`;
    }
    return fig(svgEl(w, h, body), opts.caption, Math.max(360, w));
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. LINKED LIST — value|next node boxes with arrows; singly/doubly/circular
// ─────────────────────────────────────────────────────────────────────────────
type LLOpts = {
    head?: boolean;
    doubly?: boolean;
    circular?: boolean;
    nullTail?: boolean;
    highlight?: number[];
    caption?: string;
};
export function linkedListDiagram(values: (string | number)[], opts: LLOpts = {}): string {
    const nodeW = 64, nodeH = 40, gap = 34, padX = 16;
    const headH = opts.head ? 26 : 0;
    const dblH = opts.doubly ? 10 : 0;
    const circH = opts.circular ? 30 : 0;
    const n = values.length;
    const w = padX * 2 + n * nodeW + (n - 1) * gap + (opts.nullTail !== false && !opts.circular ? 34 : 0);
    const top = headH + 14 + circH;
    const h = top + nodeH + dblH + 18;
    const hi = new Set(opts.highlight ?? []);
    let body = "";
    const cy = top + nodeH / 2;

    const cx = (i: number) => padX + i * (nodeW + gap);
    // head pointer
    if (opts.head) {
        body += `<text x="${cx(0) + 14}" y="${headH - 4}" font-size="12" font-weight="700" fill="${C.teal}">head</text>`;
        body += `<line x1="${cx(0) + 16}" y1="${headH + 2}" x2="${cx(0) + 16}" y2="${top - 2}" stroke="${C.teal}" stroke-width="1.6"/>`;
        body += `<path d="M${cx(0) + 12},${top - 8} L${cx(0) + 16},${top - 1} L${cx(0) + 20},${top - 8} Z" fill="${C.teal}"/>`;
    }
    for (let i = 0; i < n; i++) {
        const x = cx(i);
        const filled = hi.has(i);
        const valW = nodeW * 0.62;
        body += `<rect x="${x}" y="${top}" width="${nodeW}" height="${nodeH}" rx="4" fill="${filled ? C.tealFill : "#ffffff"}" stroke="${filled ? C.teal : C.line}" stroke-width="${filled ? 1.8 : 1.3}"/>`;
        body += `<line x1="${x + valW}" y1="${top}" x2="${x + valW}" y2="${top + nodeH}" stroke="${filled ? C.teal : C.line}" stroke-width="1.1"/>`;
        body += `<text x="${x + valW / 2}" y="${cy + 5}" text-anchor="middle" font-size="15" font-weight="600" fill="${C.ink}">${esc(String(values[i]))}</text>`;
        // next-pointer dot
        body += `<circle cx="${x + valW + (nodeW - valW) / 2}" cy="${cy}" r="3" fill="${C.line}"/>`;
        // arrow to next
        if (i < n - 1) {
            const sx = x + nodeW, ex = cx(i + 1);
            body += `<line x1="${sx + 2}" y1="${cy}" x2="${ex - 8}" y2="${cy}" stroke="${C.line}" stroke-width="1.5"/>`;
            body += `<path d="M${ex - 8},${cy - 4} L${ex - 1},${cy} L${ex - 8},${cy + 4} Z" fill="${C.line}"/>`;
            if (opts.doubly) {
                const by = top + nodeH + 6;
                body += `<line x1="${ex}" y1="${by}" x2="${sx + 2}" y2="${by}" stroke="${C.muted}" stroke-width="1.2" stroke-dasharray="3 2"/>`;
                body += `<path d="M${sx + 8},${by - 3} L${sx + 1},${by} L${sx + 8},${by + 3} Z" fill="${C.muted}"/>`;
            }
        }
    }
    // null tail
    if (opts.nullTail !== false && !opts.circular) {
        const sx = cx(n - 1) + nodeW, ex = sx + 30;
        body += `<line x1="${sx + 2}" y1="${cy}" x2="${ex - 6}" y2="${cy}" stroke="${C.line}" stroke-width="1.5"/>`;
        body += `<text x="${ex + 2}" y="${cy + 5}" font-size="15" fill="${C.muted}">∅</text>`;
    }
    // circular back-edge
    if (opts.circular) {
        const sx = cx(n - 1) + nodeW - (nodeW - nodeW * 0.62) / 2;
        const fx = cx(0) + (nodeW * 0.62) / 2;
        const yTop = top - 10;
        body += `<path d="M${sx},${top} C${sx},${yTop - 18} ${fx},${yTop - 18} ${fx},${top}" fill="none" stroke="${C.teal}" stroke-width="1.5"/>`;
        body += `<path d="M${fx - 4},${top - 7} L${fx},${top - 1} L${fx + 4},${top - 7} Z" fill="${C.teal}"/>`;
    }
    return fig(svgEl(w, h, body), opts.caption, Math.max(360, w));
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. STACK — vertical boxes growing upward, top marker, base line
// ─────────────────────────────────────────────────────────────────────────────
export function stackDiagram(values: (string | number)[], opts: { caption?: string; topLabel?: string } = {}): string {
    const bw = 90, bh = 34, padX = 70, padTop = 16;
    const n = values.length;
    const w = padX + bw + 80;
    const h = padTop + n * bh + 30;
    let body = "";
    for (let i = 0; i < n; i++) {
        // top of stack is last element → draw at the top
        const v = values[n - 1 - i];
        const y = padTop + i * bh;
        const isTop = i === 0;
        body += `<rect x="${padX}" y="${y}" width="${bw}" height="${bh}" fill="${isTop ? C.tealFill : "#ffffff"}" stroke="${isTop ? C.teal : C.border}" stroke-width="${isTop ? 1.8 : 1.2}"/>`;
        body += `<text x="${padX + bw / 2}" y="${y + bh / 2 + 5}" text-anchor="middle" font-size="14" font-weight="600" fill="${C.ink}">${esc(String(v))}</text>`;
        if (isTop) {
            body += `<text x="${padX + bw + 12}" y="${y + bh / 2 + 4}" font-size="12" font-weight="700" fill="${C.teal}">← ${esc(opts.topLabel ?? "top")}</text>`;
        }
    }
    const baseY = padTop + n * bh;
    body += `<line x1="${padX - 4}" y1="${baseY}" x2="${padX + bw + 4}" y2="${baseY}" stroke="${C.line}" stroke-width="2.5"/>`;
    body += `<text x="${padX + bw / 2}" y="${baseY + 18}" text-anchor="middle" font-size="11" fill="${C.muted}">base</text>`;
    return fig(svgEl(w, h, body), opts.caption, 360);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. GRID — 2D matrix / DP table with optional highlights and row/col headers
// ─────────────────────────────────────────────────────────────────────────────
export function gridDiagram(rows: (string | number)[][], opts: { caption?: string; colHeaders?: (string | number)[]; rowHeaders?: (string | number)[]; highlight?: [number, number][] } = {}): string {
    const cell = 38;
    const hh = opts.colHeaders ? cell : 0;
    const rh = opts.rowHeaders ? cell : 0;
    const R = rows.length, COLS = rows[0]?.length ?? 0;
    const w = rh + COLS * cell + 8;
    const h = hh + R * cell + 8;
    const hi = new Set((opts.highlight ?? []).map(([r, c]) => `${r},${c}`));
    let body = "";
    if (opts.colHeaders) for (let c = 0; c < COLS; c++) body += `<text x="${rh + c * cell + cell / 2}" y="${hh - 12}" text-anchor="middle" font-size="11" font-weight="700" fill="${C.muted}" font-family="${esc(MONO)}">${esc(String(opts.colHeaders[c]))}</text>`;
    for (let r = 0; r < R; r++) {
        if (opts.rowHeaders) body += `<text x="${rh - 14}" y="${hh + r * cell + cell / 2 + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="${C.muted}" font-family="${esc(MONO)}">${esc(String(opts.rowHeaders[r]))}</text>`;
        for (let c = 0; c < COLS; c++) {
            const x = rh + c * cell, y = hh + r * cell;
            const f = hi.has(`${r},${c}`);
            body += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${f ? C.tealFill : "#ffffff"}" stroke="${f ? C.teal : C.border}" stroke-width="${f ? 1.8 : 1}"/>`;
            body += `<text x="${x + cell / 2}" y="${y + cell / 2 + 5}" text-anchor="middle" font-size="13" font-weight="${f ? 700 : 500}" fill="${C.ink}">${esc(String(rows[r][c]))}</text>`;
        }
    }
    return fig(svgEl(w, h, body), opts.caption, Math.max(320, w));
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. COMPLEXITY GROWTH CHART — the classic O(...) curves
// ─────────────────────────────────────────────────────────────────────────────
export function complexityChart(caption?: string): string {
    const W = 480, H = 320, ml = 46, mb = 36, mt = 16, mr = 12;
    const pw = W - ml - mr, ph = H - mt - mb;
    const x0 = ml, y0 = mt + ph;
    const N = 32, YMAX = 64;
    const sx = (n: number) => x0 + (n / N) * pw;
    const sy = (y: number) => y0 - (Math.min(y, YMAX) / YMAX) * ph;
    const path = (f: (n: number) => number) => {
        let d = "";
        for (let i = 1; i <= N; i++) { const x = sx(i), y = sy(f(i)); d += (i === 1 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1); if (f(i) >= YMAX) break; }
        return d;
    };
    const curves: [string, (n: number) => number, string][] = [
        ["O(1)", () => 1, C.muted],
        ["O(log n)", (n) => Math.log2(n + 1), "#0891b2"],
        ["O(n)", (n) => n, C.teal],
        ["O(n log n)", (n) => n * Math.log2(n + 1) / 4, C.amber],
        ["O(n²)", (n) => n * n / 12, "#ea580c"],
        ["O(2ⁿ)", (n) => Math.pow(2, n / 5), C.red],
    ];
    let body = "";
    // axes
    body += `<line x1="${x0}" y1="${mt}" x2="${x0}" y2="${y0}" stroke="${C.line}" stroke-width="1.4"/>`;
    body += `<line x1="${x0}" y1="${y0}" x2="${x0 + pw}" y2="${y0}" stroke="${C.line}" stroke-width="1.4"/>`;
    body += `<text x="${x0 + pw / 2}" y="${H - 6}" text-anchor="middle" font-size="12" fill="${C.muted}">input size n →</text>`;
    body += `<text x="14" y="${mt + ph / 2}" text-anchor="middle" font-size="12" fill="${C.muted}" transform="rotate(-90 14 ${mt + ph / 2})">operations →</text>`;
    // curves + end labels
    for (const [label, f, col] of curves) {
        body += `<path d="${path(f)}" fill="none" stroke="${col}" stroke-width="2.2"/>`;
        // place label near where curve exits
        let lx = sx(N), ly = sy(f(N));
        for (let i = 1; i <= N; i++) { if (f(i) >= YMAX) { lx = sx(i); ly = sy(YMAX) + 2; break; } }
        const anchor = lx > x0 + pw - 60 ? "end" : "start";
        body += `<text x="${anchor === "end" ? lx - 4 : lx + 5}" y="${Math.max(mt + 10, ly)}" text-anchor="${anchor}" font-size="11.5" font-weight="700" fill="${col}">${esc(label)}</text>`;
    }
    return fig(svgEl(W, H, body), caption ?? "How runtime grows with input size — the gap between O(log n) and O(2ⁿ) is the difference between instant and never.", 500);
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. GRAPHVIZ — render DOT to a cleaned, responsive, captioned SVG
// ─────────────────────────────────────────────────────────────────────────────
type DotOpts = { caption?: string; maxW?: number; rankdir?: "TB" | "LR" };
export function dotSvg(dotBody: string, opts: DotOpts = {}): string {
    const graph = `digraph G {
  bgcolor="transparent";
  rankdir="${opts.rankdir ?? "TB"}";
  node [shape=circle, style=filled, fillcolor="#ffffff", color="${C.line}", penwidth=1.3, fontname="Helvetica", fontsize=13, fontcolor="${C.ink}", width=0.42, fixedsize=false];
  edge [color="${C.line}", penwidth=1.3, arrowsize=0.7, fontname="Helvetica", fontsize=11, fontcolor="${C.muted}"];
  ${dotBody}
}`;
    let svg = execSync(`${DOT} -Tsvg`, { input: graph, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    // strip XML decl, doctype, comments, and the graphviz <title>/<polygon> bg
    svg = svg
        .replace(/<\?xml[^>]*\?>/g, "")
        .replace(/<!DOCTYPE[^>]*>/g, "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<title>[\s\S]*?<\/title>/g, "");
    // pull width/height (pt) and viewBox, make responsive
    const vb = svg.match(/viewBox="([^"]+)"/);
    const wPt = svg.match(/width="(\d+)pt"/);
    const maxW = opts.maxW ?? (wPt ? Math.min(560, Math.max(220, parseInt(wPt[1]))) : 480);
    svg = svg.replace(/<svg[^>]*>/, `<svg ${vb ? `viewBox="${vb[1]}"` : ""} width="100%" style="max-width:${maxW}px;height:auto" xmlns="http://www.w3.org/2000/svg" role="img">`);
    return fig(svg.trim(), opts.caption, maxW + 40);
}

/** Convenience colour constants for node fills in DOT bodies. */
export const DOT_COLORS = {
    teal: `style=filled, fillcolor="${C.tealFill}", color="${C.teal}"`,
    amber: `style=filled, fillcolor="${C.amberFill}", color="${C.amber}"`,
    red: `style=filled, fillcolor="${C.redFill}", color="${C.red}"`,
};

export const PALETTE = C;
