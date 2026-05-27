"use client";

/**
 * Numbered-circle stepper used at the top of every onboarding card. Shows the
 * user where they are in a 2- or 3-step funnel. Completed steps get a check
 * + accent fill, current step gets a filled circle with the number + ring,
 * future steps get an outlined circle. A horizontal track behind the circles
 * fills in as you advance.
 *
 *   <Stepper steps={["Phone", "Payment", "Profile"]} current={1} />
 *
 * `current` is the 0-indexed active step. Set to `steps.length` to render
 * the "all complete" state (used by the success screen on the institute
 * wizard).
 *
 * Layout note: the circles use `justify-between` so they end up at the
 * extremities and at even intervals, and labels sit directly below their
 * circle via a column flex on each step. The connector track is an
 * absolutely-positioned span between the first and last circle centers —
 * keeping it OUT of the flex row means it can't push labels off-axis.
 */
import { Fragment, type FC } from "react";

export interface StepperProps {
    steps: string[];
    /** 0-indexed current step. Use steps.length for "all complete". */
    current: number;
    className?: string;
}

const CIRCLE_PX = 36; // h-9 / w-9

export const Stepper: FC<StepperProps> = ({ steps, current, className }) => {
    // Clamp progress to [0, 1]. For a 3-step flow, current=0 → 0%, current=1 → 50%,
    // current=2 → 100%, current=3 (done) → 100%.
    const divisor = Math.max(1, steps.length - 1);
    const fillRatio = Math.min(Math.max(current, 0), divisor) / divisor;

    return (
        <div
            className={`relative w-full ${className ?? ""}`}
            aria-label="Onboarding progress"
        >
            {/* Connector track — sits between the centres of the first and last
                circles, behind the circles themselves. Centred vertically on
                the circle (top = CIRCLE_PX/2 - track height/2). */}
            <div
                aria-hidden
                className="absolute h-0.5 rounded-full bg-slate-200"
                style={{
                    top: CIRCLE_PX / 2 - 1,
                    left: CIRCLE_PX / 2,
                    right: CIRCLE_PX / 2,
                }}
            />
            <div
                aria-hidden
                className="absolute h-0.5 rounded-full bg-primary-600 transition-all duration-500 ease-out"
                style={{
                    top: CIRCLE_PX / 2 - 1,
                    left: CIRCLE_PX / 2,
                    width: `calc((100% - ${CIRCLE_PX}px) * ${fillRatio})`,
                }}
            />

            {/* Steps — circles evenly distributed, labels stacked under each. */}
            <ol className="relative flex items-start justify-between">
                {steps.map((label, idx) => {
                    const isComplete = idx < current;
                    const isCurrent = idx === current;
                    return (
                        <li
                            key={label}
                            className="flex flex-col items-center"
                            aria-current={isCurrent ? "step" : undefined}
                        >
                            <div
                                className={[
                                    "flex items-center justify-center rounded-full text-sm font-semibold transition-all duration-300",
                                    isComplete
                                        ? "bg-primary-600 text-white shadow-sm"
                                        : isCurrent
                                          ? "bg-primary-600 text-white shadow-md ring-4 ring-primary-100"
                                          : "border-2 border-slate-300 bg-white text-slate-400",
                                ].join(" ")}
                                style={{ width: CIRCLE_PX, height: CIRCLE_PX }}
                            >
                                {isComplete ? (
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        viewBox="0 0 20 20"
                                        fill="currentColor"
                                        className="h-5 w-5"
                                        aria-hidden
                                    >
                                        <path
                                            fillRule="evenodd"
                                            d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 011.42-1.42L8.5 12.08l6.79-6.79a1 1 0 011.414 0z"
                                            clipRule="evenodd"
                                        />
                                    </svg>
                                ) : (
                                    <Fragment>{idx + 1}</Fragment>
                                )}
                            </div>
                            <span
                                className={[
                                    "mt-2 text-[11px] font-semibold uppercase tracking-wide transition-colors duration-300",
                                    isComplete || isCurrent ? "text-slate-700" : "text-slate-400",
                                ].join(" ")}
                            >
                                {label}
                            </span>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
};
