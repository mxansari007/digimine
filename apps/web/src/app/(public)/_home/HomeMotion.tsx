"use client";

import { useEffect } from "react";

/**
 * Tiny client island — renders nothing. Just attaches the IntersectionObserver
 * that reveals `[data-motion]` elements as they scroll into view, and the
 * cursor-parallax variables used by the hero gradient. Lives in its own file
 * so the rest of the homepage can stay a pure server component.
 */
export default function HomeMotion() {
    useEffect(() => {
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const motionItems = Array.from(document.querySelectorAll<HTMLElement>("[data-motion]"));

        if (reduceMotion) {
            motionItems.forEach((item) => item.classList.add("is-visible"));
            return;
        }

        motionItems.forEach((item, index) => {
            item.style.setProperty("--motion-delay", `${Math.min(index * 45, 360)}ms`);
        });

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) entry.target.classList.add("is-visible");
                });
            },
            { rootMargin: "0px 0px -10% 0px", threshold: 0.12 }
        );
        motionItems.forEach((item) => observer.observe(item));

        const handlePointerMove = (event: PointerEvent) => {
            const x = Math.round((event.clientX / window.innerWidth) * 100);
            const y = Math.round((event.clientY / window.innerHeight) * 100);
            document.documentElement.style.setProperty("--landing-x", `${x}%`);
            document.documentElement.style.setProperty("--landing-y", `${y}%`);
        };
        window.addEventListener("pointermove", handlePointerMove, { passive: true });

        return () => {
            observer.disconnect();
            window.removeEventListener("pointermove", handlePointerMove);
        };
    }, []);

    return null;
}
