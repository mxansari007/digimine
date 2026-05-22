"use client";

type Point = { label: string; value: number };

/**
 * Small inline trend chart. Renders a smooth line + optional rolling-average
 * dashed line behind it. Used on per-student dashboards.
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
            <div className="flex h-32 items-center justify-center text-xs text-gray-400">
                No data yet
            </div>
        );
    }
    const width = 600;
    const padX = 24;
    const padY = 14;
    const innerW = width - padX * 2;
    const innerH = height - padY * 2;
    const n = points.length;
    const step = n === 1 ? 0 : innerW / (n - 1);

    const xy = (i: number, v: number) => ({
        x: padX + i * step,
        y: padY + innerH - (Math.min(yMax, Math.max(0, v)) / yMax) * innerH,
    });

    const path = points
        .map((p, i) => {
            const { x, y } = xy(i, p.value);
            return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(" ");

    const fillPath =
        n === 0
            ? ""
            : `${path} L ${xy(n - 1, 0).x.toFixed(1)} ${padY + innerH} L ${xy(0, 0).x.toFixed(1)} ${padY + innerH} Z`;

    return (
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
            <defs>
                <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={accent} stopOpacity="0.18" />
                    <stop offset="100%" stopColor={accent} stopOpacity="0" />
                </linearGradient>
            </defs>
            {/* Grid lines */}
            {[0, 25, 50, 75, 100].map((g) => (
                <line
                    key={g}
                    x1={padX}
                    x2={width - padX}
                    y1={padY + innerH - (g / yMax) * innerH}
                    y2={padY + innerH - (g / yMax) * innerH}
                    stroke="#e5e7eb"
                    strokeDasharray="2 2"
                />
            ))}
            <path d={fillPath} fill="url(#trendFill)" />
            <path d={path} fill="none" stroke={accent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            {rolling && rolling.length > 1 && (
                <path
                    d={rolling
                        .map((r, i) => {
                            const { x, y } = xy(r.index, r.average);
                            return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
                        })
                        .join(" ")}
                    fill="none"
                    stroke="#94a3b8"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                />
            )}
            {/* Points */}
            {points.map((p, i) => {
                const { x, y } = xy(i, p.value);
                return (
                    <g key={i}>
                        <circle cx={x} cy={y} r={3.5} fill="white" stroke={accent} strokeWidth={2} />
                        <title>
                            {p.label}: {p.value}
                            {yLabel}
                        </title>
                    </g>
                );
            })}
        </svg>
    );
}
