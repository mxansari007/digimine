import type { Metadata } from "next";
import { buildMetadata, faqJsonLd, jsonLdScript } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
    title: "Teach on Digimine — plans, pricing, and tools for independent teachers",
    description:
        "Run your classes, sell on the marketplace, and track every student — all on one platform. Free to start. Pro plans from ₹499/month.",
    path: "/for-teachers",
    keywords: [
        "teach online India",
        "online teacher platform",
        "sell courses online",
        "create mock tests",
        "teacher marketplace India",
    ],
});

const FAQS = [
    {
        question: "Is the Free plan really free?",
        answer:
            "Yes — no card required and no surprise downgrades. Capped to 1 class, 25 students, and a small content quota.",
    },
    {
        question: "What's the difference between Pro and Institute?",
        answer:
            "Pro is for individual teachers. Institute is a separate product for organisations with multiple teachers, a centralised question bank, institute-wide tests, GST invoicing, and custom branding.",
    },
    {
        question: "How does the marketplace work?",
        answer:
            "Starter and Pro teachers can submit content for review. Approved content gets listed publicly. You earn a revenue share on every paid sale — payouts are processed monthly.",
    },
    {
        question: "Do students pay anything?",
        answer:
            "Only if you charge them via the marketplace. Private classroom content is free for enrolled students — your subscription covers it.",
    },
];

export default function ForTeachersLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <script
                type="application/ld+json"
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: jsonLdScript(faqJsonLd(FAQS)) }}
            />
            {children}
        </>
    );
}
