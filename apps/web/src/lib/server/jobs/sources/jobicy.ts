import type { JobSourceAdapter, NormalizedJob } from "./types";
import { fetchJson, stripHtml } from "./types";

// Jobicy — free, NO API KEY. Global remote jobs (mostly outside India), which
// keeps the map's remote layer healthy alongside the India-heavy Adzuna feed.
// https://jobicy.com/api/v2/remote-jobs  (count maxes at 50 per call)
// "" = all industries; the rest focus the tech/placement-relevant remote roles.
const INDUSTRIES = ["", "dev", "data-science", "devops-sysadmin"];

interface JobicyJob {
    id: number | string;
    url: string;
    jobTitle: string;
    companyName?: string;
    companyLogo?: string | null;
    jobIndustry?: string[] | string;
    jobType?: string[] | string;
    jobGeo?: string;
    jobExcerpt?: string;
    jobDescription?: string;
    pubDate?: string;
    salaryMin?: number | string;
    salaryMax?: number | string;
    salaryCurrency?: string;
}

const normType = (v: unknown): string | null => {
    const raw = Array.isArray(v) ? v[0] : v;
    if (!raw) return null;
    return String(raw).toLowerCase().replace(/[\s-]+/g, "_"); // "Full-Time" → "full_time"
};
const numOrNull = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

export const jobicySource: JobSourceAdapter = {
    id: "jobicy",
    enabled: () => true,
    async fetch(): Promise<NormalizedJob[]> {
        const out: NormalizedJob[] = [];
        for (const ind of INDUSTRIES) {
            const url = `https://jobicy.com/api/v2/remote-jobs?count=50${ind ? `&industry=${ind}` : ""}`;
            const data = await fetchJson<{ jobs?: JobicyJob[] }>(url, {
                headers: { "User-Agent": "PlacementRanker/1.0 (jobs)" },
            });
            for (const j of data?.jobs ?? []) {
                if (!j?.id || !j?.jobTitle || !j?.url) continue;
                const industry = Array.isArray(j.jobIndustry) ? j.jobIndustry : j.jobIndustry ? [j.jobIndustry] : [];
                out.push({
                    source: "jobicy",
                    externalId: String(j.id),
                    title: stripHtml(j.jobTitle, 160),
                    company: (j.companyName || "Company").trim(),
                    companyLogo: j.companyLogo || null,
                    locationRaw: (j.jobGeo || "Remote").trim(),
                    lat: null,
                    lng: null,
                    remote: true, // Jobicy is a remote-only board
                    type: normType(j.jobType),
                    category: industry[0] ? stripHtml(industry[0], 60) : null,
                    salaryMin: numOrNull(j.salaryMin),
                    salaryMax: numOrNull(j.salaryMax),
                    salaryCurrency: j.salaryCurrency || null,
                    descriptionSnippet: stripHtml(j.jobExcerpt || j.jobDescription || ""),
                    applyUrl: j.url,
                    tags: industry.map((t) => stripHtml(String(t), 30)).filter(Boolean).slice(0, 5),
                    postedAt: j.pubDate || null,
                });
            }
        }
        return out;
    },
};
