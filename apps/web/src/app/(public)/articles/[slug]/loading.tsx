/**
 * Loading skeleton for an individual article. Matches the live layout
 * (breadcrumb · category chip · title · author row · cover · body · sidebar
 * TOC) so the page never appears to "jump" when real content arrives.
 *
 * Lightweight on purpose — pure server component, no @digimine/ui imports,
 * just Tailwind `animate-pulse` divs. Shows during ISR revalidation or the
 * first cold render before edge cache is warm.
 */
export default function Loading() {
    return (
        <main className="bg-white">
            <div className="container-page py-10 sm:py-14">
                <div className="grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
                    <article className="min-w-0 max-w-3xl">
                        {/* Breadcrumb */}
                        <Bar className="h-3 w-24" />

                        {/* Chips row */}
                        <div className="mt-5 flex gap-2">
                            <Bar className="h-6 w-24 rounded-full" />
                            <Bar className="h-6 w-16 rounded-full" />
                        </div>

                        {/* Title — two lines so the visual mass matches a typical headline */}
                        <Bar className="mt-4 h-9 w-full max-w-2xl" />
                        <Bar className="mt-2 h-9 w-4/5" />

                        {/* Subtitle */}
                        <Bar className="mt-4 h-4 w-full max-w-xl" />

                        {/* Author row */}
                        <div className="mt-6 flex items-center gap-3">
                            <Bar className="h-9 w-9 rounded-full" />
                            <div className="space-y-1.5">
                                <Bar className="h-3 w-32" />
                                <Bar className="h-3 w-44" />
                            </div>
                        </div>

                        {/* Cover — locked to 16:9 like the real image container */}
                        <div className="mt-8 aspect-[16/9] w-full overflow-hidden rounded-2xl bg-slate-200/70 animate-pulse" />

                        {/* Body — heading + 5 paragraph blocks of variable widths */}
                        <div className="mt-10 space-y-6">
                            <ParagraphBlock heading widths={["w-full", "w-11/12", "w-10/12", "w-3/4"]} />
                            <ParagraphBlock widths={["w-full", "w-full", "w-11/12", "w-9/12"]} />
                            <ParagraphBlock heading widths={["w-full", "w-10/12", "w-11/12"]} />
                            <ParagraphBlock widths={["w-full", "w-full", "w-3/4"]} />
                            <ParagraphBlock widths={["w-full", "w-11/12", "w-10/12", "w-2/3"]} />
                        </div>

                        {/* Tags row */}
                        <div className="mt-12 flex flex-wrap gap-2 border-t border-slate-200 pt-6">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <Bar key={i} className="h-6 w-16 rounded-full" />
                            ))}
                        </div>

                        {/* About-the-author card */}
                        <div className="mt-10 rounded-2xl border border-slate-200 p-5 space-y-2">
                            <Bar className="h-3 w-32" />
                            <Bar className="h-4 w-40" />
                            <Bar className="h-3 w-full max-w-md" />
                            <Bar className="h-3 w-3/4 max-w-md" />
                        </div>

                        {/* Discussion placeholder — matches what the real lazy-loaded
                            ArticleDiscussion reserves as its own fallback */}
                        <div className="mt-16 border-t border-slate-200 pt-10">
                            <Bar className="h-6 w-32" />
                            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <div className="h-20" />
                            </div>
                        </div>
                    </article>

                    {/* Sticky right rail — TOC skeleton */}
                    <aside className="hidden lg:block">
                        <div className="sticky top-24 space-y-2">
                            <Bar className="h-3 w-24" />
                            <Bar className="h-4 w-32" />
                            <Bar className="h-4 w-40" />
                            <Bar className="h-4 w-28" />
                            <Bar className="h-4 w-36" />
                            <Bar className="h-4 w-32" />
                        </div>
                    </aside>
                </div>
            </div>
        </main>
    );
}

function Bar({ className = "" }: { className?: string }) {
    return <div className={`animate-pulse rounded-md bg-slate-200/70 ${className}`} />;
}

function ParagraphBlock({
    widths,
    heading = false,
}: {
    widths: string[];
    heading?: boolean;
}) {
    return (
        <div className="space-y-2">
            {heading && <Bar className="mb-2 h-6 w-1/3" />}
            {widths.map((w, i) => (
                <Bar key={i} className={`h-3.5 ${w}`} />
            ))}
        </div>
    );
}
