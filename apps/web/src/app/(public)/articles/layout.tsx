import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
    title: "Articles — tutorials, tech news, and subject deep-dives",
    description:
        "Long-form articles from the Digimine editorial team — exam-prep tutorials, technology news, subject deep-dives, and announcements.",
    path: "/articles",
    keywords: [
        "study articles",
        "exam tips",
        "tech news",
        "subject tutorials",
        "NEET tips",
        "JEE tips",
    ],
});

export default function ArticlesLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
