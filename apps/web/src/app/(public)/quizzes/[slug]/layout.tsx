import type { Metadata } from "next";
import { adminDb } from "@/lib/firebase/admin";
import {
    breadcrumbJsonLd,
    buildMetadata,
    jsonLdScript,
    quizJsonLd,
} from "@/lib/seo";

interface RouteParams {
    params: { slug: string };
}

async function loadQuiz(slug: string) {
    if (!slug) return null;
    try {
        const snap = await adminDb
            .collection("quizzes")
            .where("slug", "==", slug)
            .limit(1)
            .get();
        if (snap.empty) return null;
        const d = snap.docs[0];
        const data = d.data() || {};
        if ((data.status || "draft") !== "published" || data.isDeleted) return null;
        return { id: d.id, ...data } as any;
    } catch {
        return null;
    }
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
    const quiz = await loadQuiz(decodeURIComponent(params.slug || ""));
    if (!quiz) {
        return buildMetadata({
            title: "Quiz not found",
            description: "The quiz you’re looking for isn’t available.",
            path: `/quizzes/${params.slug}`,
            noIndex: true,
        });
    }
    return buildMetadata({
        title: quiz.title,
        description:
            quiz.shortDescription ||
            quiz.description?.slice(0, 160) ||
            "Practice quiz on Digimine — instant feedback, explanations per question.",
        path: `/quizzes/${quiz.slug}`,
        ogImage: quiz.thumbnailURL || null,
        keywords: Array.isArray(quiz.tags) ? quiz.tags.slice(0, 12) : undefined,
    });
}

export default async function QuizDetailLayout({
    children,
    params,
}: RouteParams & { children: React.ReactNode }) {
    const quiz = await loadQuiz(decodeURIComponent(params.slug || ""));
    if (!quiz) return <>{children}</>;

    const path = `/quizzes/${quiz.slug}`;
    const ld = quizJsonLd({
        name: quiz.title,
        description: quiz.shortDescription || quiz.description || "",
        path,
        image: quiz.thumbnailURL || null,
        timeLimitMinutes: quiz.timeLimitMinutes,
        totalQuestions: quiz.totalQuestions,
        educationalLevel: quiz.difficulty,
    });
    const crumb = breadcrumbJsonLd([
        { name: "Home", path: "/" },
        { name: "Quizzes", path: "/quizzes" },
        { name: quiz.title, path },
    ]);

    return (
        <>
            <script
                type="application/ld+json"
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: jsonLdScript(ld) }}
            />
            <script
                type="application/ld+json"
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: jsonLdScript(crumb) }}
            />
            {children}
        </>
    );
}
