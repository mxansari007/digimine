import * as React from "react";

/**
 * PlacementRanker logo mark — an upward zig-zag line graph capped with an
 * arrowhead, reading instantly as "ranking / growth / trending up". Colours
 * match the teal brand palette so the mark feels native everywhere it lands
 * (sidebar, header, marketing, auth pages).
 */
function LogoMark({
    size = 28,
    className = "",
}: {
    size?: number;
    className?: string;
}) {
    // Unique ID suffix to avoid SVG ID collisions when multiple instances
    // render on the same page (e.g. header + sidebar).
    const id = React.useId().replace(/:/g, "");

    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            style={{ overflow: "visible" }}
            aria-hidden="true"
        >
            <defs>
                <linearGradient
                    id={`lg-${id}`}
                    x1="3"
                    y1="23"
                    x2="29"
                    y2="9"
                    gradientUnits="userSpaceOnUse"
                >
                    {/* Teal primary palette gradient, rising bottom-left → top-right */}
                    <stop stopColor="#0f766e" />
                    <stop offset="0.55" stopColor="#14b8a6" />
                    <stop offset="1" stopColor="#2dd4bf" />
                </linearGradient>
            </defs>

            <g
                stroke={`url(#lg-${id})`}
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
            >
                {/* Trending-up line (even segments, draws on hover) */}
                <path d="M2.7 22.7 L11.3 14 L18 20.7 L29.3 9.3" className={`line-${id}`} />
                {/* Arrowhead — a clean corner sitting exactly on the line tip */}
                <path d="M21.3 9.3 L29.3 9.3 L29.3 17.3" />
            </g>

            <style>{`
                .line-${id} {
                    stroke-dasharray: 62;
                    stroke-dashoffset: 0;
                }
                svg:hover .line-${id}, .group:hover .line-${id} {
                    animation: lr-draw 1.1s ease-in-out;
                }
                @keyframes lr-draw {
                    0% { stroke-dashoffset: 62; }
                    100% { stroke-dashoffset: 0; }
                }
            `}</style>
        </svg>
    );
}

export interface LogoProps {
    /** "light" for dark backgrounds, "dark" for light backgrounds. */
    variant?: "light" | "dark";
    /** Render the wordmark text next to the icon. */
    showText?: boolean;
    /** Pixel size of the icon mark. */
    iconSize?: number;
    className?: string;
}

export function Logo({
    variant = "dark",
    showText = true,
    iconSize = 24,
    className = "",
}: LogoProps) {
    const fontSize = iconSize * 0.66;
    // `variant="light"` forces a white wordmark for surfaces that are dark in
    // BOTH themes (dark heroes, footers). Otherwise the wordmark uses the
    // slate tokens, which flip with the theme — dark text in light mode,
    // light text in Tokyo Night dark mode — so it stays legible on the
    // header/sidebar whichever theme is active.
    const mutedClass = variant === "light" ? "text-white/70" : "text-slate-600";
    const boldClass = variant === "light" ? "text-white" : "text-slate-900";

    return (
        <span className={`group inline-flex items-center gap-2 ${className}`}>
            <LogoMark size={iconSize} />
            {showText && (
                <span
                    className="font-display"
                    style={{
                        fontSize: `${fontSize}px`,
                        letterSpacing: "-0.01em",
                        lineHeight: 1,
                    }}
                >
                    <span className={`font-medium ${mutedClass}`}>Placement</span>
                    <span className={`font-extrabold ${boldClass}`}>Ranker</span>
                </span>
            )}
        </span>
    );
}
