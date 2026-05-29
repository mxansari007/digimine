/**
 * Circular readiness gauge — pure SVG, no chart dependency (matches the
 * codebase's "no charting library" convention; see TrendLine).
 */
interface Props {
    value: number; // 0-100
    size?: number;
    label?: string;
    sublabel?: string;
}

function ringColor(v: number): string {
    if (v >= 75) return "#0d9488"; // primary teal
    if (v >= 50) return "#f59e0b"; // accent amber
    return "#e11d48"; // danger rose
}

export function ReadinessRing({ value, size = 132, label, sublabel }: Props) {
    const v = Math.max(0, Math.min(100, Math.round(value)));
    const stroke = 10;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const offset = c - (v / 100) * c;
    const color = ringColor(v);

    return (
        <div className="inline-flex flex-col items-center">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    stroke="#e2e8f0"
                    strokeWidth={stroke}
                />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    stroke={color}
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={c}
                    strokeDashoffset={offset}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                    style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.22,1,0.36,1)" }}
                />
                <text
                    x="50%"
                    y="48%"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="font-display font-black"
                    style={{ fontSize: size * 0.26, fill: "#0f172a" }}
                >
                    {v}
                </text>
                <text
                    x="50%"
                    y="64%"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    style={{ fontSize: size * 0.1, fill: "#64748b" }}
                >
                    / 100
                </text>
            </svg>
            {label && <p className="mt-1 text-sm font-semibold text-slate-700">{label}</p>}
            {sublabel && <p className="text-xs text-slate-500">{sublabel}</p>}
        </div>
    );
}
