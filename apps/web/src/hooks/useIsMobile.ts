"use client";

import { useEffect, useState } from "react";

/**
 * True on phone-width viewports. Starts `false` (SSR/first paint = desktop) and
 * syncs on mount, so it never causes a hydration mismatch.
 */
export function useIsMobile(maxWidth = 767): boolean {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
        const sync = () => setIsMobile(mq.matches);
        sync();
        mq.addEventListener("change", sync);
        return () => mq.removeEventListener("change", sync);
    }, [maxWidth]);

    return isMobile;
}
