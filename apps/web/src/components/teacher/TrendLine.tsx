"use client";

type Point = { label: string; value: number };

/**
 * Small inline trend chart. Smooth line + soft area fill, faint gridlines with
 * value labels, and an emphasised latest point. Pure SVG (no chart dep).
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
    if (points.length === 0) {
        return (
            <div className="flex h-32 flex-col items-center justify-center gap-1 text-xs text-slate-400">
                <svg className="h-6 w-6 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l5-5 4 4 8-8" />
                </svg>
                No data yet
            </div>
        );
    }
    const width = 600;
    const padX = 30;
    const padY = 16;
    const innerW = width - padX * 2;
    const innerH = height - padY * 2;
    const n = points.length;
    const step = n === 1 ? 0 : innerW / (n - 1);
    const uid = accent.replace("#", "");

    const xy = (i: number, v: number) => ({
        x: padX + i * step,
        y: padY + innerH - (Math.min(yMax, Math.max(0, v)) / yMax) * innerH,
    });

    // Catmull-Rom → cubic-bezier for a smooth line through the points.
    const pts = points.map((p, i) => xy(i, p.value));
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
    const linePath = smooth(pts);
    const fillPath = `${linePath} L ${pts[n - 1].x.toFixed(1)} ${padY + innerH} L ${pts[0].x.toFixed(1)} ${padY + innerH} Z`;
    const last = pts[n - 1];
    const lastVal = Math.round(points[n - 1].value);

    return (
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
            <defs>
                <linearGradient id={`fill-${uid}`} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={accent} stopOpacity="0.22" />
                    <stop offset="100%" stopColor={accent} stopOpacity="0" />
                </linearGradient>
                <linearGradient id={`stroke-${uid}`} x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stopColor={accent} stopOpacity="0.7" />
                    <stop offset="100%" stopColor={accent} />
                </linearGradient>
            </defs>

            {/* gridlines + y labels */}
            {[0, 25, 50, 75, 100].map((g) => {
                const y = padY + innerH - (g / yMax) * innerH;
                return (
                    <g key={g}>
                        <line x1={padX} x2={width - padX} y1={y} y2={y} stroke="#eef2f6" strokeDasharray="3 3" />
                        <text x={padX - 6} y={y} textAnchor="end" dominantBaseline="middle" style={{ fontSize: 9, fill: "#cbd5e1" }}>
                            {Math.round((g / 100) * yMax)}
                        </text>
                    </g>
                );
            })}

            <path d={fillPath} fill={`url(#fill-${uid})`} />
            <path d={linePath} fill="none" stroke={`url(#stroke-${uid})`} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

            {rolling && rolling.length > 1 && (
                <path
                    d={smooth(rolling.map((r) => xy(r.index, r.average)))}
                    fill="none"
                    stroke="#94a3b8"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                />
            )}

            {/* points */}
            {pts.map((p, i) => (
                <g key={i}>
                    <circle cx={p.x} cy={p.y} r={i === n - 1 ? 4.5 : 3} fill="white" stroke={accent} strokeWidth={2} />
                    <title>{points[i].label}: {points[i].value}{yLabel}</title>
                </g>
            ))}

            {/* latest value pill */}
            {n > 0 && (
                <g>
                    <circle cx={last.x} cy={last.y} r={7} fill={accent} fillOpacity="0.15" />
                    <text
                        x={Math.min(last.x, width - padX - 2)}
                        y={Math.max(last.y - 12, padY + 6)}
                        textAnchor={last.x > width - 60 ? "end" : "middle"}
                        style={{ fontSize: 11, fontWeight: 800, fill: accent }}
                    >
                        {lastVal}{yLabel}
                    </text>
                </g>
            )}
        </svg>
    );
}
