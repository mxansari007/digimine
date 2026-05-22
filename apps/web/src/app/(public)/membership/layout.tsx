import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
    title: "Membership — unlock practice, mock tests, quizzes & courses",
    description:
        "One PlacementRanker membership unlocks premium DSA/SQL practice, mock tests, quizzes, and courses. Flexible plans, promo codes, cancel anytime.",
    path: "/membership",
    keywords: ["digimine membership", "premium plan", "DSA subscription", "mock test subscription India"],
});

export default function MembershipLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
