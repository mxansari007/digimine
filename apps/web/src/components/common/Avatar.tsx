"use client";

import { useState } from "react";

/**
 * User avatar that gracefully degrades to initials when the photo URL is
 * missing OR fails to load. Use this instead of a bare `<img>` anywhere the
 * source could be an external CDN (Google profile photos especially — their
 * tokens expire and the bare img tag then renders the browser's broken-image
 * default, which looks terrible).
 *
 *   <Avatar src={user.photoURL} name={user.displayName} size={36} />
 *
 *  - `name` is used for the initials chip and the `alt` attribute. Up to 2
 *    initials are shown (first letter of first + last whitespace-separated
 *    word).
 *  - `size` is a px value applied to both width and height (the avatar is
 *    always circular).
 *  - `ring`: render a thin primary ring around the avatar (used in headers
 *    for visual separation against busy backgrounds).
 */
export interface AvatarProps {
    src?: string | null;
    name?: string | null;
    /** Email as a secondary source for the initials when name is empty. */
    email?: string | null;
    size?: number;
    ring?: boolean;
    className?: string;
}

function deriveInitials(name?: string | null, email?: string | null): string {
    const source = (name || "").trim() || (email || "").split("@")[0] || "";
    if (!source) return "U";
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
    return ((parts[0]?.[0] || "") + (parts[parts.length - 1]?.[0] || "")).toUpperCase();
}

export default function Avatar({
    src,
    name,
    email,
    size = 36,
    ring = false,
    className = "",
}: AvatarProps) {
    const [errored, setErrored] = useState(false);
    const initials = deriveInitials(name, email);
    const showImg = !!src && !errored;
    const dim = { width: size, height: size };
    const fontSize = Math.max(11, Math.round(size * 0.4));

    const ringClasses = ring
        ? "ring-2 ring-white shadow-sm outline outline-1 outline-slate-200/80"
        : "";

    if (showImg) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={src as string}
                alt={name || "User avatar"}
                style={dim}
                referrerPolicy="no-referrer"
                onError={() => setErrored(true)}
                className={`shrink-0 rounded-full object-cover ${ringClasses} ${className}`}
            />
        );
    }

    return (
        <span
            style={{ ...dim, fontSize }}
            className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-700 font-semibold uppercase tracking-tight text-white ${ringClasses} ${className}`}
            aria-label={name || "User avatar"}
        >
            {initials}
        </span>
    );
}
