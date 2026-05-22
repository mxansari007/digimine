import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
    title: "Practice quizzes — short, sharp, daily",
    description:
        "Bite-sized quizzes across subjects and difficulty levels. Instant feedback, explanation per question, and a leaderboard to keep you honest.",
    path: "/quizzes",
    keywords: ["quizzes", "practice quizzes", "daily quiz", "subject quizzes", "online quiz India"],
});

export default function QuizzesLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
