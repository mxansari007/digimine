import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
    title: "Practice — DSA & SQL with spaced repetition and a mastery map",
    description:
        "Solve DSA & SQL problems, but actually retain them. Revision Radar resurfaces problems before you forget, Pattern Lens trains recognition, and a Mastery Map shows exactly where you're weak.",
    path: "/practice",
    keywords: [
        "DSA practice",
        "SQL practice",
        "coding interview prep",
        "spaced repetition DSA",
        "pattern recognition coding",
        "DSA practice platform India",
    ],
});

export default function PracticeLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
