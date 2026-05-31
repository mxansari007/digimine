/**
 * Behaviour-dimension radar (spider) chart — pure SVG, no chart dependency
 * (matches the codebase convention). Shows the whole skill profile at a glance
 * so strengths/weaknesses pop visually. `weak` axes are highlighted in rose.
 */
interface Axis {
    key: string;
    label: string;
    value: number; // 0-100
}

const clamp = (v: number) => Math.max(0, Math.min(100, v));

export function SkillRadar({
    axes,
    size = 260,
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
    const radius = size / 2 - 52; // room for two-line labels
    const rings = [0.25, 0.5, 0.75, 1];

    const angle = (i: number) => (-90 + (360 / n) * i) * (Math.PI / 180);
    const point = (i: number, frac: number) => ({
        x: cx + radius * frac * Math.cos(angle(i)),
        y: cy + radius * frac * Math.sin(angle(i)),
    });
    const poly = (frac: number) =>
        axes.map((_, i) => { const p = point(i, frac); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(" ");
    const dataPoly = axes
        .map((a, i) => { const p = point(i, clamp(a.value) / 100); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; })
        .join(" ");

    return (
        <svg
            width="100%"
            viewBox={`0 0 ${size} ${size}`}
            className="mx-auto block max-w-[300px] overflow-visible"
            role="img"
            aria-label="Skill radar"
        >
            <defs>
                <radialGradient id="radarFill" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor={accent} stopOpacity="0.30" />
                    <stop offset="100%" stopColor={accent} stopOpacity="0.10" />
                </radialGradient>
                <filter id="radarGlow" x="-25%" y="-25%" width="150%" height="150%">
                    <feDropShadow dx="0" dy="1" stdDeviation="2.5" floodColor={accent} floodOpacity="0.28" />
                </filter>
            </defs>

            {/* base disc + concentric rings (outer ring slightly stronger) */}
            <polygon points={poly(1)} fill="rgb(var(--c-slate-50))" />
            {rings.map((f, idx) => (
                <polygon key={f} points={poly(f)} fill="none" stroke={idx === rings.length - 1 ? "rgb(var(--c-slate-200))" : "rgb(var(--c-slate-200))"} strokeWidth={1} />
            ))}
            {/* spokes */}
            {axes.map((_, i) => {
                const p = point(i, 1);
                return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgb(var(--c-slate-200))" strokeWidth={1} />;
            })}

            {/* data shape */}
            <polygon
                points={dataPoly}
                fill="url(#radarFill)"
                stroke={accent}
                strokeWidth={2}
                strokeLinejoin="round"
                filter="url(#radarGlow)"
                style={{ transition: "all 0.6s cubic-bezier(0.22,1,0.36,1)" }}
            />
            {/* vertices — small solid dots in the line colour (uniform, no rings).
                "Weak" is conveyed by the red label, not a different dot colour. */}
            {axes.map((a, i) => {
                const p = point(i, clamp(a.value) / 100);
                return <circle key={i} cx={p.x} cy={p.y} r={2.5} fill={accent} />;
            })}

            {/* axis labels — full name above, value below */}
            {axes.map((a, i) => {
                const p = point(i, 1.14);
                const isWeak = weak.includes(a.key);
                const anchor = Math.abs(p.x - cx) < 8 ? "middle" : p.x > cx ? "start" : "end";
                return (
                    <g key={a.key}>
                        <text x={p.x} y={p.y - 6} textAnchor={anchor} dominantBaseline="middle" style={{ fontSize: 10, fontWeight: 600, fill: isWeak ? "#e11d48" : "rgb(var(--c-slate-500))" }}>
                            {shortLabel(a.label)}
                        </text>
                        <text x={p.x} y={p.y + 7} textAnchor={anchor} dominantBaseline="middle" style={{ fontSize: 12, fontWeight: 800, fill: isWeak ? "#e11d48" : "rgb(var(--c-slate-900))" }}>
                            {Math.round(clamp(a.value))}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}

/** Clean radar axis labels: drop "/ accuracy" suffixes and any parenthetical,
 *  but keep the full name (these labels are short enough to fit). */
function shortLabel(label: string): string {
    return label
        .replace(/ \/ .*/, "")
        .replace(/\s*\(.*\)/, "")
        .trim();
}
