import type { JobSourceAdapter, NormalizedJob } from "./types";
import { fetchJson, stripHtml } from "./types";

// Adzuna — free tier (register for app_id + app_key at
// https://developer.adzuna.com). The India endpoint returns real lat/lng, so
// these jobs plot precisely without geocoding. Set ADZUNA_APP_ID / ADZUNA_APP_KEY.
const APP_ID = process.env.ADZUNA_APP_ID || "";
const APP_KEY = process.env.ADZUNA_APP_KEY || "";

// Broad IT coverage for placement students. Adzuna's `it-jobs` category is the
// core feed; the keyword queries add specific in-demand roles plus the
// cross-category fresher/intern/trainee openings. Deduped downstream by id, so
// overlap is harmless. One API call per page → this list is ~18 calls/sync,
// comfortably inside the free tier. Add/trim entries to tune coverage vs budget.
const QUERIES: { what?: string; category?: string; pages?: number }[] = [
    { category: "it-jobs", pages: 2 }, // the whole IT category — the core feed
    { what: "software engineer" },
    { what: "full stack developer" },
    { what: "frontend developer" },
    { what: "backend developer" },
    { what: "data scientist" },
    { what: "data engineer" },
    { what: "machine learning engineer" },
    { what: "devops engineer" },
    { what: "cloud engineer" },
    { what: "android developer" },
    { what: "qa engineer" },
    { what: "cyber security" },
    { what: "business analyst" },
    { what: "fresher software" },
    { what: "graduate engineer trainee" },
    { what: "software internship" },
];

interface AdzunaJob {
    id: string | number;
    title: string;
    company?: { display_name?: string };
    location?: { display_name?: string };
    latitude?: number;
    longitude?: number;
    category?: { label?: string };
    contract_time?: string; // full_time | part_time
    contract_type?: string; // permanent | contract
    salary_min?: number;
    salary_max?: number;
    redirect_url: string;
    description?: string;
    created?: string;
}

export const adzunaSource: JobSourceAdapter = {
    id: "adzuna",
    enabled: () => Boolean(APP_ID && APP_KEY),
    async fetch(): Promise<NormalizedJob[]> {
        if (!APP_ID || !APP_KEY) return [];
        const out: NormalizedJob[] = [];
        for (const qy of QUERIES) {
            const pages = qy.pages ?? 1;
            for (let page = 1; page <= pages; page++) {
                const params = new URLSearchParams({
                    app_id: APP_ID,
                    app_key: APP_KEY,
                    results_per_page: "50",
                    "content-type": "application/json",
                });
                if (qy.what) params.set("what", qy.what);
                if (qy.category) params.set("category", qy.category);
                const url = `https://api.adzuna.com/v1/api/jobs/in/search/${page}?${params.toString()}`;
                const data = await fetchJson<{ results?: AdzunaJob[] }>(url);
                for (const r of data?.results ?? []) {
                    if (!r?.id || !r?.title || !r?.redirect_url) continue;
                    const locationRaw = r.location?.display_name?.trim() || "India";
                    out.push({
                        source: "adzuna",
                        externalId: String(r.id),
                        title: r.title.trim(),
                        company: (r.company?.display_name || "Company").trim(),
                        companyLogo: null,
                        locationRaw,
                        lat: typeof r.latitude === "number" ? r.latitude : null,
                        lng: typeof r.longitude === "number" ? r.longitude : null,
                        remote: /remote|work from home|wfh/i.test(locationRaw + " " + r.title),
                        type: r.contract_time || r.contract_type || null,
                        category: r.category?.label || null,
                        salaryMin: typeof r.salary_min === "number" ? Math.round(r.salary_min) : null,
                        salaryMax: typeof r.salary_max === "number" ? Math.round(r.salary_max) : null,
                        salaryCurrency: "INR",
                        descriptionSnippet: stripHtml(r.description || ""),
                        applyUrl: r.redirect_url,
                        tags: r.category?.label ? [r.category.label] : [],
                        postedAt: r.created || null,
                    });
                }
            }
        }
        return out;
    },
};
