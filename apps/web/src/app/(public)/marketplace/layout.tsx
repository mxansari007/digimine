import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
    title: "Marketplace — content from independent teachers",
    description:
        "Browse quizzes, tests, contests, and courses published by independent teachers on Digimine. Buy direct, support creators.",
    path: "/marketplace",
    keywords: ["teacher marketplace", "study material India", "buy quizzes", "buy tests", "teacher store"],
});

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
