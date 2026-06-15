import type { JobSourceAdapter, NormalizedJob } from "./types";
import { fetchJson, stripHtml } from "./types";

// Remotive — free, NO API KEY. Returns remote roles (all `remote: true`).
// https://remotive.com/api/remote-jobs
const ENDPOINT = "https://remotive.com/api/remote-jobs?limit=200";

interface RemotiveJob {
    id: number;
    url: string;
    title: string;
    company_name: string;
    company_logo?: string | null;
    category?: string;
    job_type?: string; // full_time | contract | part_time | internship | freelance
    candidate_required_location?: string;
    publication_date?: string;
    description?: string;
    tags?: string[];
}

export const remotiveSource: JobSourceAdapter = {
    id: "remotive",
    enabled: () => true,
    async fetch(): Promise<NormalizedJob[]> {
        const data = await fetchJson<{ jobs?: RemotiveJob[] }>(ENDPOINT);
        const jobs = data?.jobs ?? [];
        return jobs
            .filter((j) => j?.id && j?.title && j?.url)
            .map((j) => ({
                source: "remotive" as const,
                externalId: String(j.id),
                title: j.title.trim(),
                company: (j.company_name || "Company").trim(),
                companyLogo: j.company_logo || null,
                locationRaw: j.candidate_required_location?.trim() || "Remote",
                lat: null,
                lng: null,
                remote: true,
                type: j.job_type || null,
                category: j.category || null,
                salaryMin: null,
                salaryMax: null,
                salaryCurrency: null,
                descriptionSnippet: stripHtml(j.description || ""),
                applyUrl: j.url,
                tags: Array.isArray(j.tags) ? j.tags.slice(0, 8) : [],
                postedAt: j.publication_date || null,
            }));
    },
};
