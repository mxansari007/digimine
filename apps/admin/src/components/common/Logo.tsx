import React from "react";

/**
 * Digimine Logo Mark — a stylized gem/prism shape
 * representing "digital mine" in a clean geometric form.
 */
function LogoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
    // Use a unique ID suffix to avoid SVG ID collisions when multiple logos render
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
        >
            <defs>
                <linearGradient id={`lg-${id}`} x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#6AA7C5" />
                    <stop offset="0.5" stopColor="#4388AA" />
                    <stop offset="1" stopColor="#2D5A73" />
                </linearGradient>

                {/* Clip path to constrain shine inside the gem */}
                <clipPath id={`clip-${id}`}>
                    <path d="M16 2L28 12L16 30L4 12L16 2Z" />
                </clipPath>

                {/* Shine gradient — a narrow bright band */}
                <linearGradient id={`shine-${id}`} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="white" stopOpacity="0" />
                    <stop offset="0.3" stopColor="white" stopOpacity="0" />
                    <stop offset="0.5" stopColor="white" stopOpacity="0.85" />
                    <stop offset="0.7" stopColor="white" stopOpacity="0" />
                    <stop offset="1" stopColor="white" stopOpacity="0" />
                </linearGradient>
            </defs>

            {/* Gem body */}
            <path d="M16 2L28 12L16 30L4 12L16 2Z" fill={`url(#lg-${id})`} />

            {/* Top facet */}
            <path d="M16 2L10 12H22L16 2Z" fill="white" fillOpacity="0.25" />

            {/* Left facet */}
            <path d="M4 12L10 12L16 30L4 12Z" fill="white" fillOpacity="0.08" />

            {/* Animated shine sweep */}
            <g clipPath={`url(#clip-${id})`}>
                <rect
                    x="-14"
                    y="-4"
                    width="22"
                    height="44"
                    fill={`url(#shine-${id})`}
                    className={`shine-rect-${id}`}
                />
            </g>

            <style>{`
                .shine-rect-${id} {
                    opacity: 0;
                    transform: translateX(-24px) rotate(25deg);
                }
                svg:hover .shine-rect-${id}, .group:hover .shine-rect-${id} {
                    animation: gem-shine 1.5s ease-in-out;
                }
                @keyframes gem-shine {
                    0% { transform: translateX(-24px) rotate(25deg); opacity: 0; }
                    15% { opacity: 1; }
                    85% { transform: translateX(40px) rotate(25deg); opacity: 1; }
                    100% { transform: translateX(40px) rotate(25deg); opacity: 0; }
                }
            `}</style>
        </svg>
    );
}

interface LogoProps {
    /** "light" for dark backgrounds, "dark" for light backgrounds */
    variant?: "light" | "dark";
    /** Show the wordmark text next to the icon */
    showText?: boolean;
    /** Size of the icon mark */
    iconSize?: number;
    className?: string;
}

export function Logo({ variant = "dark", showText = true, iconSize = 24, className = "" }: LogoProps) {
    const fontSize = iconSize * 0.68;
    const mutedColor = variant === "light" ? "rgba(255,255,255,0.7)" : "rgba(51,65,85,0.8)";
    const boldColor = variant === "light" ? "#fff" : "#0f172a";

    return (
        <span className={`group inline-flex items-center gap-2 ${className}`}>
            <LogoMark size={iconSize} />
            {showText && (
                <span
                    className="font-display uppercase"
                    style={{ fontSize: `${fontSize}px`, letterSpacing: "0.08em", lineHeight: 1 }}
                >
                    <span style={{ fontWeight: 500, color: mutedColor }}>Digi</span>
                    <span style={{ fontWeight: 800, color: boldColor }}>mine</span>
                </span>
            )}
        </span>
    );
}
