/**
 * Behaviour-dimension radar (spider) chart — pure SVG, no chart dependency
 * (matches the codebase convention). Shows the whole skill profile at a glance
 * so strengths/weaknesses pop visually. `weak` axes are highlighted.
 */
interface Axis {
    key: string;
    label: string;
    value: number; // 0-100
}

export function SkillRadar({
    axes,
    size = 280,
    accent = "#0d9488",
    weak = [],
}: {
    axes: Axis[];
    size?: number;
    accent?: string;
    weak?: string[];
}) {
    const n = axes.length;
    if (n < 3) return null;
    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 46; // leave room for labels
    const rings = [0.25, 0.5, 0.75, 1];

    // Angle for axis i — start at top (-90°), go clockwise.
    const angle = (i: number) => (-90 + (360 / n) * i) * (Math.PI / 180);
    const point = (i: number, frac: number) => ({
        x: cx + radius * frac * Math.cos(angle(i)),
        y: cy + radius * frac * Math.sin(angle(i)),
    });
    const polygon = (frac: number) =>
        axes.map((_, i) => { const p = point(i, frac); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(" ");
    const dataPolygon = axes
        .map((a, i) => { const p = point(i, Math.max(0, Math.min(100, a.value)) / 100); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; })
        .join(" ");

    return (
        <svg width="100%" viewBox={`0 0 ${size} ${size}`} className="mx-auto block max-w-[320px]" role="img" aria-label="Skill radar">
            <defs>
                <radialGradient id="radarFill" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor={accent} stopOpacity="0.35" />
                    <stop offset="100%" stopColor={accent} stopOpacity="0.12" />
                </radialGradient>
            </defs>

            {/* concentric grid rings */}
            {rings.map((f) => (
                <polygon key={f} points={polygon(f)} fill="none" stroke="#e2e8f0" strokeWidth={1} />
            ))}
            {/* axis spokes */}
            {axes.map((_, i) => {
                const p = point(i, 1);
                return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#e2e8f0" strokeWidth={1} />;
            })}

            {/* the data shape */}
            <polygon
                points={dataPolygon}
                fill="url(#radarFill)"
                stroke={accent}
                strokeWidth={2}
                strokeLinejoin="round"
                style={{ transition: "all 0.6s cubic-bezier(0.22,1,0.36,1)" }}
            />
            {/* vertices */}
            {axes.map((a, i) => {
                const p = point(i, Math.max(0, Math.min(100, a.value)) / 100);
                const isWeak = weak.includes(a.key);
                return <circle key={i} cx={p.x} cy={p.y} r={3.5} fill="#fff" stroke={isWeak ? "#e11d48" : accent} strokeWidth={2} />;
            })}

            {/* axis labels */}
            {axes.map((a, i) => {
                const p = point(i, 1.16);
                const isWeak = weak.includes(a.key);
                const anchor = Math.abs(p.x - cx) < 6 ? "middle" : p.x > cx ? "start" : "end";
                return (
                    <text
                        key={a.key}
                        x={p.x}
                        y={p.y}
                        textAnchor={anchor}
                        dominantBaseline="middle"
                        style={{ fontSize: 10, fontWeight: 600, fill: isWeak ? "#e11d48" : "#475569" }}
                    >
                        {shortLabel(a.label)}
                        <tspan dx="4" style={{ fontWeight: 700, fill: isWeak ? "#e11d48" : "#0f172a" }}>{Math.round(a.value)}</tspan>
                    </text>
                );
            })}
        </svg>
    );
}

/** Keep radar axis labels short so they don't overlap. */
function shortLabel(label: string): string {
    return label
        .replace(/Correctness \/ accuracy/i, "Correctness")
        .replace(/ \/ .*/, "")
        .replace(/\s*\(.*\)/, "")
        .split(" ")
        .slice(0, 2)
        .join(" ");
}
