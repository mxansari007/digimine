import type { Metadata } from "next";
import { stripArticleHtml } from "@digimine/types";
import { buildMetadata } from "@/lib/seo";
import { getCachedProblemMeta } from "@/lib/server/practiceCache";

// The solve page itself is an interactive client component, so per-problem SEO
// lives here in a server layout: generateMetadata reads the (cached) problem
// and sets a real title/description/canonical for each problem URL.
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
    const slug = decodeURIComponent(params.slug || "");
    const problem = await getCachedProblemMeta(slug).catch(() => null);

    if (!problem) {
        return buildMetadata({
            title: "Practice Problem",
            description: "Solve DSA & SQL practice problems with instant judging on Digimine.",
            path: `/practice/problems/${slug}`,
        });
    }

    const kindLabel = problem.kind === "sql" ? "SQL" : "DSA";
    const difficulty = problem.difficulty ? String(problem.difficulty) : "";
    const stmt = stripArticleHtml(problem.statementHtml || "").slice(0, 155).trim();
    const description = stmt || `Solve "${problem.title}", a ${difficulty} ${kindLabel} practice problem, with instant judging and spaced-repetition tracking on Digimine.`;

    return buildMetadata({
        title: `${problem.title} — ${difficulty ? difficulty[0].toUpperCase() + difficulty.slice(1) + " " : ""}${kindLabel} Practice`,
        description,
        path: `/practice/problems/${slug}`,
        keywords: [problem.title, `${kindLabel} problem`, "coding practice", "interview preparation"],
    });
}

export default function ProblemLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
