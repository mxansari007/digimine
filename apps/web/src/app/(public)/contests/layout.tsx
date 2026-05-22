import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
    title: "Live contests — race the clock, race the leaderboard",
    description:
        "Scheduled online contests for school, college, and recruitment prep. Real ranks, real prizes, real practice.",
    path: "/contests",
    keywords: ["online contests", "coding contest", "exam contest", "NEET contest", "JEE contest"],
});

export default function ContestsLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
