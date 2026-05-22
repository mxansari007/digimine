import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
    title: "Mock tests & test series — exam-grade practice",
    description:
        "Timed mock tests built for NEET, JEE, school boards, and recruitment exams. Sectional breakdowns, instant rank, and detailed solutions.",
    path: "/tests",
    keywords: ["mock test", "test series", "NEET mock", "JEE mock", "online tests India"],
});

export default function TestsLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
