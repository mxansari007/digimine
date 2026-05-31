"use client";

import { useEffect, useRef, useState } from "react";

type Point = { label: string; value: number };

/**
 * Small inline trend chart. Smooth line + soft area fill, faint gridlines with
 * value labels, and a discreet latest point. Pure SVG (no chart dep).
 *
 * Renders at the measured container width (viewBox 1:1 with pixels) so circles
 * stay round and the stroke stays uniform — `preserveAspectRatio="none"` would
 * stretch markers into ovals and fatten the line.
 */
export function TrendLine({
    points,
    rolling,
    height = 160,
    yMax = 100,
    yLabel = "%",
    accent = "#0d9488",
}: {
    points: Point[];
    rolling?: { index: number; average: number }[];
    height?: number;
    yMax?: number;
    yLabel?: string;
    accent?: string;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(600);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const ro = new ResizeObserver((entries) => {
            const w = entries[0]?.contentRect.width;
            if (w && w > 0) setWidth(Math.round(w));
        });
        ro.observe(el);
        if (el.clientWidth) setWidth(Math.round(el.clientWidth));
        return () => ro.disconnect();
    }, []);

    const padL = 26;
    const padR = 14;
    const padY = 16;
    const innerW = Math.max(1, width - padL - padR);
    const innerH = height - padY * 2;
    const n = points.length;
    const step = n <= 1 ? 0 : innerW / (n - 1);
    const uid = accent.replace("#", "");

    const xy = (i: number, v: number) => ({
        x: padL + i * step,
        y: padY + innerH - (Math.min(yMax, Math.max(0, v)) / yMax) * innerH,
    });

    // Catmull-Rom → cubic-bezier for a smooth line through the points.
    const smooth = (ps: { x: number; y: number }[]) => {
        if (ps.length < 2) return ps.length === 1 ? `M ${ps[0].x} ${ps[0].y}` : "";
        let d = `M ${ps[0].x.toFixed(1)} ${ps[0].y.toFixed(1)}`;
        for (let i = 0; i < ps.length - 1; i++) {
            const p0 = ps[i - 1] || ps[i];
            const p1 = ps[i];
            const p2 = ps[i + 1];
            const p3 = ps[i + 2] || p2;
            const c1x = p1.x + (p2.x - p0.x) / 6;
            const c1y = p1.y + (p2.y - p0.y) / 6;
            const c2x = p2.x - (p3.x - p1.x) / 6;
            const c2y = p2.y - (p3.y - p1.y) / 6;
            d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
        }
        return d;
    };

    const pts = points.map((p, i) => xy(i, p.value));
    const linePath = smooth(pts);
    const last = pts[n - 1];
    const lastVal = n ? Math.round(points[n - 1].value) : 0;

    return (
        <div ref={ref} className="w-full">
            {n === 0 ? (
                <div className="flex flex-col items-center justify-center gap-1 text-xs text-slate-400" style={{ height }}>
                    <svg className="h-6 w-6 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l5-5 4 4 8-8" />
                    </svg>
                    No data yet
                </div>
            ) : (
                <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block overflow-visible">
                    <defs>
                        <linearGradient id={`fill-${uid}`} x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor={accent} stopOpacity="0.20" />
                            <stop offset="100%" stopColor={accent} stopOpacity="0" />
                        </linearGradient>
                    </defs>

                    {/* gridlines + y labels */}
                    {[0, 25, 50, 75, 100].map((g) => {
                        const y = padY + innerH - (g / yMax) * innerH;
                        return (
                            <g key={g}>
                                <line x1={padL} x2={width - padR} y1={y} y2={y} stroke="rgb(var(--c-slate-200))" strokeWidth={1} strokeDasharray="3 3" />
                                <text x={padL - 6} y={y} textAnchor="end" dominantBaseline="middle" style={{ fontSize: 9, fill: "rgb(var(--c-slate-300))" }}>
                                    {Math.round((g / 100) * yMax)}
                                </text>
                            </g>
                        );
                    })}

                    <path d={`${linePath} L ${pts[n - 1].x.toFixed(1)} ${padY + innerH} L ${pts[0].x.toFixed(1)} ${padY + innerH} Z`} fill={`url(#fill-${uid})`} />
                    <path d={linePath} fill="none" stroke={accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

                    {rolling && rolling.length > 1 && (
                        <path d={smooth(rolling.map((r) => xy(r.index, r.average)))} fill="none" stroke="rgb(var(--c-slate-300))" strokeWidth={1.25} strokeDasharray="4 4" />
                    )}

                    {/* small, round markers (only emphasise the latest one) */}
                    {pts.map((p, i) =>
                        i === n - 1 ? null : (
                            <circle key={i} cx={p.x} cy={p.y} r={2} fill="rgb(var(--surface))" stroke={accent} strokeWidth={1.5}>
                                <title>{points[i].label}: {points[i].value}{yLabel}</title>
                            </circle>
                        )
                    )}
                    <circle cx={last.x} cy={last.y} r={6} fill={accent} fillOpacity="0.14" />
                    <circle cx={last.x} cy={last.y} r={3.2} fill="rgb(var(--surface))" stroke={accent} strokeWidth={2}>
                        <title>{points[n - 1].label}: {points[n - 1].value}{yLabel}</title>
                    </circle>
                    <text
                        x={Math.min(last.x, width - padR)}
                        y={Math.max(last.y - 11, padY + 4)}
                        textAnchor={last.x > width - 48 ? "end" : "middle"}
                        style={{ fontSize: 11, fontWeight: 800, fill: accent }}
                    >
                        {lastVal}{yLabel}
                    </text>
                </svg>
            )}
        </div>
    );
}
