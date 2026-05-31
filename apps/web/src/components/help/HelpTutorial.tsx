"use client";

/**
 * Interactive per-page walkthrough.
 *
 *   <HelpTutorial pageKey="institute-classes" steps={[
 *       { question: "How do I add teachers?", answer: "...", target: "[data-tour=…]" },
 *       ...
 *   ]} />
 *
 * Uses Driver.js for spotlight overlay + auto-positioned popover anchored
 * to real DOM elements (via CSS selector on each step). A custom animated
 * SVG cursor flies between targets with a click ripple to give the tour
 * a "screen recording" feel.
 *
 * Behavior:
 *   - (i) button renders next to a page heading
 *   - Auto-opens on first visit (localStorage flag scoped by pageKey)
 *   - Re-opening always starts from step 1
 *   - Steps with no `target` render as a centered intro/outro card
 *   - Tutorial copy lives in `components/help/tutorials.ts`
 *
 * Implementation notes:
 *   - Driver.js is loaded dynamically the first time the tour is opened
 *     so the ~5 KB JS isn't pulled into the initial page bundle.
 *   - The animated cursor is a fixed-position SVG that follows the
 *     spotlight's centre using CSS transitions. We track the spotlight via
 *     Driver.js's onHighlighted hook + a ResizeObserver for resilience
 *     against scroll/resize.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { HelpCircle } from "lucide-react";
import "driver.js/dist/driver.css";

export interface TutorialStep {
    /** Headline rendered as the popover title — phrase as a question. */
    question: string;
    /** Body text shown in the popover. */
    answer: string;
    /** Optional numbered bullets rendered below the answer. */
    bullets?: string[];
    /** Optional eyebrow chip ("Quick tip", etc.). Defaults to "Step N of M". */
    eyebrow?: string;
    /**
     * CSS selector for the element this step should spotlight. When omitted,
     * the step renders as a centered card with no anchor — useful for
     * intro/outro/general-info steps.
     */
    target?: string;
}

export interface HelpTutorialProps {
    pageKey: string;
    steps: TutorialStep[];
    label?: string;
    autoOpenOnFirstVisit?: boolean;
}

const STORAGE_PREFIX = "pr_tutorial_seen:";

export function HelpTutorial({
    pageKey,
    steps,
    label = "Page guide",
    autoOpenOnFirstVisit = true,
}: HelpTutorialProps) {
    // The Driver.js instance is created lazily on first open.
    const driverRef = useRef<{ destroy: () => void } | null>(null);
    const [cursor, setCursor] = useState<{
        x: number;
        y: number;
        visible: boolean;
        clicking: boolean;
    }>({ x: 0, y: 0, visible: false, clicking: false });
    const cursorTimeoutsRef = useRef<number[]>([]);

    /** Helper: animate the cursor to the target's centre + flash a click ripple. */
    const moveCursorTo = useCallback((el: HTMLElement | null) => {
        // Clear any pending click animations from a previous step.
        cursorTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
        cursorTimeoutsRef.current = [];

        if (!el) {
            setCursor((c) => ({ ...c, visible: false }));
            return;
        }
        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        setCursor({ x, y, visible: true, clicking: false });
        // Click ripple ~800ms after arrival so the eye sees the cursor land first.
        const t = window.setTimeout(() => {
            setCursor((c) => ({ ...c, clicking: true }));
            const t2 = window.setTimeout(() => {
                setCursor((c) => ({ ...c, clicking: false }));
            }, 600);
            cursorTimeoutsRef.current.push(t2);
        }, 800);
        cursorTimeoutsRef.current.push(t);
    }, []);

    /** Lazy-load Driver.js + start the tour. */
    const openTour = useCallback(async () => {
        if (typeof window === "undefined") return;
        // Dynamic JS import so the ~5 KB driver.js bundle stays out of the
        // initial chunk. The CSS is imported at the top of this file
        // (Next.js requires top-level CSS imports).
        const driverMod = await import("driver.js");

        // Make sure we destroy any previous instance — re-opening should
        // always start fresh.
        driverRef.current?.destroy();

        const popoverFor = (step: TutorialStep, idx: number) => ({
            title: step.question,
            description: renderDescription(step, idx, steps.length),
            // Driver.js shows its own footer; we suppress the default progress
            // text via showProgress=false above and rely on our custom eyebrow.
        });

        const inst = driverMod.driver({
            showProgress: true,
            showButtons: ["next", "previous", "close"],
            nextBtnText: "Next →",
            prevBtnText: "← Back",
            doneBtnText: "Got it",
            allowClose: true,
            // Light dim — enough to focus attention on the highlighted
            // element without making the surrounding UI unreadable. The
            // bright pulsing ring on the active element provides the
            // actual "this is what to look at" signal.
            overlayOpacity: 0.35,
            stagePadding: 12,
            stageRadius: 14,
            popoverClass: "pr-tutorial-popover",
            steps: steps.map((s, idx) => ({
                element: s.target,
                popover: popoverFor(s, idx),
                onHighlighted: (el) => {
                    // Move the animated cursor to the highlighted element.
                    // When `el` is undefined (target missing or no-target step),
                    // hide the cursor — the popover is centered instead.
                    if (el instanceof HTMLElement) {
                        moveCursorTo(el);
                    } else {
                        setCursor((c) => ({ ...c, visible: false }));
                    }
                },
            })),
            onDestroyed: () => {
                setCursor((c) => ({ ...c, visible: false }));
                cursorTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
                cursorTimeoutsRef.current = [];
                try {
                    window.localStorage.setItem(`${STORAGE_PREFIX}${pageKey}`, "1");
                } catch {
                    /* ignore */
                }
            },
        });
        driverRef.current = inst as unknown as { destroy: () => void };
        inst.drive();
    }, [steps, pageKey, moveCursorTo]);

    // Auto-open on first visit.
    //
    // We flip the "seen" flag the moment the tour mounts — not when it's
    // dismissed. Otherwise a quick refresh mid-tour would re-trigger the
    // auto-open and feel naggy. The (i) icon remains as the explicit
    // re-entry point for users who want to revisit it.
    useEffect(() => {
        if (!autoOpenOnFirstVisit) return;
        if (typeof window === "undefined") return;
        try {
            const seen = window.localStorage.getItem(`${STORAGE_PREFIX}${pageKey}`);
            if (seen) return;
            window.localStorage.setItem(`${STORAGE_PREFIX}${pageKey}`, "1");
        } catch {
            return;
        }
        // Slight delay so the page's primary content paints first.
        const t = window.setTimeout(() => openTour(), 600);
        return () => window.clearTimeout(t);
    }, [pageKey, autoOpenOnFirstVisit, openTour]);

    // Keep the cursor centred over the spotlight if the user scrolls / the
    // viewport resizes while a step is active.
    useEffect(() => {
        const recompute = () => {
            const active = document.querySelector(
                ".driver-active-element"
            ) as HTMLElement | null;
            if (active) moveCursorTo(active);
        };
        window.addEventListener("scroll", recompute, { passive: true });
        window.addEventListener("resize", recompute);
        return () => {
            window.removeEventListener("scroll", recompute);
            window.removeEventListener("resize", recompute);
        };
    }, [moveCursorTo]);

    // Cleanup the Driver.js instance on unmount.
    useEffect(() => {
        return () => {
            driverRef.current?.destroy();
            cursorTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
        };
    }, []);

    if (steps.length === 0) return null;

    return (
        <>
            <button
                type="button"
                onClick={openTour}
                aria-label={label}
                title={label}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-primary-500 transition-colors hover:bg-primary-50 dark:hover:bg-primary-500/10 hover:text-primary-700 dark:hover:text-primary-300"
            >
                <HelpCircle className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>

            {/* Animated tour cursor — fixed-position SVG above all UI. The
                Driver.js overlay sits at z-10000-ish, so we go above that. */}
            <div
                aria-hidden
                style={{
                    position: "fixed",
                    left: 0,
                    top: 0,
                    transform: `translate3d(${cursor.x - 8}px, ${cursor.y - 4}px, 0)`,
                    transition: "transform 900ms cubic-bezier(0.4, 0, 0.2, 1), opacity 250ms",
                    opacity: cursor.visible ? 1 : 0,
                    pointerEvents: "none",
                    zIndex: 100000,
                }}
            >
                {/* Click ripple — pulses when `clicking` flips true. Uses
                    the app's primary teal so the cursor reads as part of
                    the product rather than a generic indigo widget. */}
                <span
                    style={{
                        position: "absolute",
                        left: -10,
                        top: -10,
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        background: "rgba(13, 148, 136, 0.45)",
                        transform: cursor.clicking ? "scale(1)" : "scale(0)",
                        opacity: cursor.clicking ? 0 : 1,
                        transition: cursor.clicking
                            ? "transform 600ms ease-out, opacity 600ms ease-out"
                            : "none",
                    }}
                />
                {/* The cursor itself — macOS-style arrow */}
                <svg
                    width="22"
                    height="28"
                    viewBox="0 0 22 28"
                    fill="none"
                    style={{
                        filter: "drop-shadow(0 2px 6px rgba(15, 23, 42, 0.35))",
                    }}
                >
                    <path
                        d="M2 2L2 24L8 18H17L2 2Z"
                        fill="white"
                        stroke="#0f172a"
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                    />
                </svg>
            </div>

            {/* Scoped style overrides for Driver.js — re-skinned to match
                our design system (slate palette, primary blue accents,
                rounded corners). Injected via dangerouslySetInnerHTML
                because styled-jsx isn't enabled in this project. */}
            <style dangerouslySetInnerHTML={{ __html: `
                .pr-tutorial-popover {
                    background: #ffffff !important;
                    border: 1px solid rgb(226 232 240) !important;
                    border-radius: 14px !important;
                    box-shadow: 0 20px 50px -10px rgba(15, 23, 42, 0.25) !important;
                    padding: 0 !important;
                    max-width: 380px !important;
                    color: rgb(15 23 42) !important;
                }
                .pr-tutorial-popover .driver-popover-title {
                    font-family: var(--font-display, inherit);
                    font-size: 1.05rem !important;
                    font-weight: 700 !important;
                    color: rgb(15 23 42) !important;
                    padding: 1rem 1.25rem 0.25rem !important;
                    margin: 0 !important;
                    line-height: 1.3 !important;
                }
                .pr-tutorial-popover .driver-popover-description {
                    font-size: 0.875rem !important;
                    line-height: 1.5 !important;
                    color: rgb(71 85 105) !important;
                    padding: 0.25rem 1.25rem 1rem !important;
                    margin: 0 !important;
                }
                .pr-tutorial-popover .driver-popover-footer {
                    display: flex !important;
                    align-items: center !important;
                    justify-content: space-between !important;
                    gap: 0.5rem !important;
                    padding: 0.75rem 1.25rem !important;
                    border-top: 1px solid rgb(241 245 249) !important;
                    background: rgb(248 250 252) !important;
                    border-radius: 0 0 14px 14px !important;
                }
                .pr-tutorial-popover .driver-popover-progress-text {
                    color: rgb(100 116 139) !important;
                    font-size: 0.75rem !important;
                    font-weight: 600 !important;
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                    order: -1;
                }
                .pr-tutorial-popover .driver-popover-navigation-btns {
                    display: flex;
                    gap: 0.5rem;
                }
                .pr-tutorial-popover .driver-popover-prev-btn,
                .pr-tutorial-popover .driver-popover-next-btn {
                    /* primary-600 — matches the app's teal CTAs */
                    background: rgb(13 148 136) !important;
                    color: #fff !important;
                    border: none !important;
                    border-radius: 8px !important;
                    padding: 0.4rem 0.85rem !important;
                    font-size: 0.8125rem !important;
                    font-weight: 600 !important;
                    text-shadow: none !important;
                    box-shadow: none !important;
                    cursor: pointer;
                    transition: background-color 150ms;
                }
                .pr-tutorial-popover .driver-popover-prev-btn {
                    background: transparent !important;
                    color: rgb(71 85 105) !important;
                }
                .pr-tutorial-popover .driver-popover-prev-btn:hover {
                    background: rgb(241 245 249) !important;
                }
                .pr-tutorial-popover .driver-popover-next-btn:hover {
                    /* primary-700 */
                    background: rgb(15 118 110) !important;
                }
                .pr-tutorial-popover .driver-popover-close-btn {
                    color: rgb(148 163 184) !important;
                    width: 24px !important;
                    height: 24px !important;
                    top: 8px !important;
                    right: 8px !important;
                }
                .pr-tutorial-popover .driver-popover-close-btn:hover {
                    color: rgb(15 23 42) !important;
                }
                .pr-tutorial-popover .driver-popover-arrow {
                    border-color: #ffffff !important;
                }
                /* The spotlight is provided by Driver.js itself (the SVG
                   overlay has a transparent hole around the active
                   element). We add a high-contrast double ring — a thin
                   white inner stroke + a bright teal outer stroke — so
                   the highlighted element is unmistakable against both
                   light and dim backgrounds. The pulse animates the
                   outer offset only so neighbouring pixels never dim.
                   Colors match the app's primary palette (teal-600/500). */
                .driver-active-element,
                .driver-active-element:focus,
                .driver-active-element:hover {
                    position: relative !important;
                    z-index: 10001 !important;
                    /* Inner white separator + outer teal-600 solid ring. */
                    box-shadow:
                        0 0 0 2px #ffffff,
                        0 0 0 5px rgb(13, 148, 136) !important;
                    border-radius: 10px !important;
                    transition: box-shadow 220ms ease-out !important;
                    animation: pr-tutorial-pulse 1.6s ease-in-out infinite;
                }
                @keyframes pr-tutorial-pulse {
                    0%, 100% {
                        box-shadow:
                            0 0 0 2px #ffffff,
                            0 0 0 5px rgb(13, 148, 136);
                    }
                    50% {
                        box-shadow:
                            0 0 0 2px #ffffff,
                            0 0 0 7px rgb(20, 184, 166);
                    }
                }
                /* Eyebrow + bullets we inject into the description.
                   Palette aligned with the app's primary teal. */
                .pr-tutorial-eyebrow {
                    display: inline-block;
                    margin-bottom: 4px;
                    padding: 2px 8px;
                    border-radius: 999px;
                    /* primary-50 / primary-700 */
                    background: rgb(240 253 250);
                    color: rgb(15 118 110);
                    font-size: 10px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                .pr-tutorial-bullets {
                    margin: 8px 0 0;
                    padding: 0;
                    list-style: none;
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    counter-reset: pr-tutorial-step;
                }
                .pr-tutorial-bullets li {
                    display: flex;
                    gap: 8px;
                    font-size: 13px;
                    line-height: 1.45;
                    color: rgb(51 65 85);
                }
                .pr-tutorial-bullets li::before {
                    counter-increment: pr-tutorial-step;
                    content: counter(pr-tutorial-step);
                    flex-shrink: 0;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 18px;
                    height: 18px;
                    border-radius: 999px;
                    /* primary-100 / primary-700 */
                    background: rgb(204 251 241);
                    color: rgb(15 118 110);
                    font-size: 10px;
                    font-weight: 700;
                    margin-top: 1px;
                }
            ` }} />
        </>
    );
}

/**
 * Compose the popover body HTML. Driver.js accepts a string (HTML), which
 * lets us slot in the eyebrow chip + bullet list inline. We escape the
 * primary text fields to keep this safe against accidental markup in the
 * tutorial registry.
 */
function renderDescription(step: TutorialStep, idx: number, total: number): string {
    const eyebrow = escapeHtml(step.eyebrow || `Step ${idx + 1} of ${total}`);
    const answer = escapeHtml(step.answer);
    const bullets = (step.bullets || [])
        .map((b) => `<li>${escapeHtml(b)}</li>`)
        .join("");
    return [
        `<span class="pr-tutorial-eyebrow">${eyebrow}</span>`,
        `<div>${answer}</div>`,
        bullets ? `<ol class="pr-tutorial-bullets">${bullets}</ol>` : "",
    ].join("");
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
