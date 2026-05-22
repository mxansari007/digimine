import type { Metadata } from "next";
import { buildMetadata, itemListJsonLd, jsonLdScript } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
    title: "Online courses — learn at your own pace",
    description:
        "Hand-picked courses from teachers and creators across NEET, JEE, CBSE, programming, and more. Lifetime access, mobile-friendly, and built for India.",
    path: "/courses",
    keywords: ["online courses India", "NEET courses", "JEE courses", "coding courses", "CBSE courses"],
});

export default function CoursesLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <script
                type="application/ld+json"
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{
                    __html: jsonLdScript(
                        itemListJsonLd(
                            [{ name: "Courses catalog", path: "/courses" }],
                            "PlacementRanker Courses"
                        )
                    ),
                }}
            />
            {children}
        </>
    );
}
