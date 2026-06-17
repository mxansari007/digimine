"use client";

/**
 * A small, phone-only heads-up shown above heavy authoring forms (building
 * tests/quizzes/courses/question banks). We don't block authoring on mobile —
 * teachers can still save a draft — but the rich editors and multi-column
 * layouts are genuinely better on a wider screen, so we set the expectation.
 * Hidden on md+.
 */
export function MobileAuthoringNotice({ what = "Building this" }: { what?: string }) {
    return (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 md:hidden dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">
            <svg className="mt-0.5 h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17h4.5M12 3a6 6 0 00-3.6 10.8c.4.3.6.76.6 1.25V15h6v.05c0-.49.2-.95.6-1.25A6 6 0 0012 3z" />
            </svg>
            <span>
                {what} works best on a larger screen — you can still edit and save a draft here, but a laptop gives you the full editor and side-by-side layout.
            </span>
        </div>
    );
}
