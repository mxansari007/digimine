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

function ringStops(v: number): [string, string] {
    // A two-stop gradient per band so the arc itself reads "good/ok/low".
    if (v >= 75) return ["#14b8a6", "#0d9488"]; // teal
    if (v >= 50) return ["#fbbf24", "#f59e0b"]; // amber
    return ["#fb7185", "#e11d48"]; // rose
}

function statusWord(v: number): string {
    if (v >= 80) return "Interview-ready";
    if (v >= 65) return "Strong";
    if (v >= 50) return "On track";
    if (v >= 30) return "Building";
    return "Early days";
}

export function ReadinessRing({ value, size = 140, label, sublabel }: Props) {
    const v = Math.max(0, Math.min(100, Math.round(value)));
    const stroke = 12;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const offset = c - (v / 100) * c;
    const [from, to] = ringStops(v);
    const gid = `ring-${from.slice(1)}-${to.slice(1)}`;

    return (
        <div className="inline-flex flex-col items-center">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <defs>
                    <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor={from} />
                        <stop offset="100%" stopColor={to} />
                    </linearGradient>
                    <filter id={`${gid}-glow`} x="-30%" y="-30%" width="160%" height="160%">
                        <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor={to} floodOpacity="0.35" />
                    </filter>
                </defs>
                {/* track */}
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f6" strokeWidth={stroke} />
                {/* value arc */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    stroke={`url(#${gid})`}
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={c}
                    strokeDashoffset={offset}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                    filter={`url(#${gid}-glow)`}
                    style={{ transition: "stroke-dashoffset 0.7s cubic-bezier(0.22,1,0.36,1)" }}
                />
                <text
                    x="50%"
                    y="45%"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="font-display font-black"
                    style={{ fontSize: size * 0.27, fill: "#0f172a" }}
                >
                    {v}
                </text>
                <text x="50%" y="58%" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: size * 0.085, fill: "#94a3b8" }}>
                    / 100
                </text>
                <text x="50%" y="70%" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: size * 0.082, fontWeight: 700, fill: to }}>
                    {statusWord(v).toUpperCase()}
                </text>
            </svg>
            {label && <p className="mt-1 text-sm font-semibold text-slate-700">{label}</p>}
            {sublabel && <p className="text-xs text-slate-500">{sublabel}</p>}
        </div>
    );
}
