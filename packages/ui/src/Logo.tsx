import * as React from "react";

/**
 * PlacementRanker logo mark — the serif "R" whose leg rises into a chart line
 * (sage) peaking at a gold dot, reading instantly as "ranking / trending up".
 *
 * Ships as two pre-keyed transparent PNGs: a navy mark for light surfaces and
 * a white mark for dark surfaces, swapped via the `.dark` class so the logo
 * stays legible in both themes. The PNGs live in each consuming app's /public
 * (logo-mark-light.png = navy, logo-mark-dark.png = white).
 */
function LogoMark({
    size = 28,
    variant = "dark",
    className = "",
}: {
    size?: number;
    variant?: "light" | "dark";
    className?: string;
}) {
    const common = {
        width: size,
        height: size,
        alt: "",
        "aria-hidden": true as const,
        style: { objectFit: "contain" as const },
    };
    // variant="light" targets surfaces that are dark in BOTH themes (dark
    // heroes, footers) → always the white mark, no theme swap.
    if (variant === "light") {
        // eslint-disable-next-line @next/next/no-img-element
        return <img src="/logo-mark-dark.png" {...common} className={className} />;
    }
    // variant="dark" adapts to the active theme: navy mark on light, white on dark.
    return (
        <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark-light.png" {...common} className={`block dark:hidden ${className}`} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark-dark.png" {...common} className={`hidden dark:block ${className}`} />
        </>
    );
}

export interface LogoProps {
    /** "light" for surfaces dark in both themes, "dark" to adapt to the theme. */
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
    // BOTH themes. Otherwise the wordmark uses the slate tokens, which flip
    // with the theme — dark text in light mode, light text in dark mode — so
    // it stays legible on the header/sidebar whichever theme is active.
    const mutedClass = variant === "light" ? "text-white/70" : "text-slate-600";
    const boldClass = variant === "light" ? "text-white" : "text-slate-900";

    return (
        <span className={`group inline-flex items-center gap-2 ${className}`}>
            <LogoMark size={iconSize} variant={variant} />
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
