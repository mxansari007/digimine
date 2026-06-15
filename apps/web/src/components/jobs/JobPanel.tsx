"use client";

import type { JobOpening } from "@digimine/types";

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function timeAgo(iso: string | null): string {
    if (!iso) return "";
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return "";
    const d = Math.max(0, Date.now() - t);
    const days = Math.floor(d / 86_400_000);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 30) return `${days}d ago`;
    const dt = new Date(t);
    return `${dt.getDate()} ${MONTH[dt.getMonth()]}`;
}

function salaryLabel(j: JobOpening): string | null {
    const { salaryMin, salaryMax, salaryCurrency } = j;
    if (salaryMin == null && salaryMax == null) return null;
    const cur = salaryCurrency === "INR" ? "₹" : salaryCurrency ? `${salaryCurrency} ` : "";
    const fmt = (n: number) => (n >= 100000 ? `${(n / 100000).toFixed(1)}L` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`);
    if (salaryMin != null && salaryMax != null) return `${cur}${fmt(salaryMin)}–${fmt(salaryMax)}`;
    return `${cur}${fmt((salaryMin ?? salaryMax) as number)}`;
}

const SOURCE_LABEL: Record<string, string> = { internal: "Posted by us", remotive: "Remotive", adzuna: "Adzuna" };

export default function JobPanel({ job, onClose }: { job: JobOpening; onClose: () => void }) {
    const loc = [job.location.city, job.location.state, job.location.country].filter(Boolean).join(", ") || job.location.raw || (job.remote ? "Remote" : "—");
    const pay = salaryLabel(job);
    return (
        <div className="flex h-full flex-col">
            <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
                <div className="min-w-0">
                    <div className="truncate text-[11px] font-semibold uppercase tracking-wider text-teal-300/80">
                        {job.company}
                    </div>
                    <h3 className="mt-1 text-base font-semibold leading-snug text-white">{job.title}</h3>
                </div>
                <button
                    onClick={onClose}
                    aria-label="Close"
                    className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white"
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-4">
                <div className="flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-xs text-slate-300">
                        📍 {loc}
                    </span>
                    {job.remote && (
                        <span className="rounded-full bg-teal-400/15 px-2.5 py-1 text-xs font-medium text-teal-300">Remote</span>
                    )}
                    {job.type && (
                        <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs capitalize text-slate-300">
                            {job.type.replace(/_/g, " ")}
                        </span>
                    )}
                    {pay && (
                        <span className="rounded-full bg-amber-400/15 px-2.5 py-1 text-xs font-medium text-amber-300">{pay}</span>
                    )}
                </div>

                {job.descriptionSnippet && (
                    <p className="text-sm leading-relaxed text-slate-300/90">{job.descriptionSnippet}</p>
                )}

                {job.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {job.tags.map((t) => (
                            <span key={t} className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] text-slate-400">
                                {t}
                            </span>
                        ))}
                    </div>
                )}

                <div className="flex items-center gap-3 text-[11px] text-slate-500">
                    <span>{SOURCE_LABEL[job.source] || job.source}</span>
                    {job.postedAt && <span>· {timeAgo(job.postedAt)}</span>}
                </div>
            </div>

            <div className="border-t border-white/10 p-4">
                <a
                    href={job.applyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-teal-400"
                >
                    Apply
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M7 17 17 7M7 7h10v10" />
                    </svg>
                </a>
            </div>
        </div>
    );
}
