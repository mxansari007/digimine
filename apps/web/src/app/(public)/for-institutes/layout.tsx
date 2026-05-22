import type { Metadata } from "next";
import { buildMetadata, faqJsonLd, jsonLdScript } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
    title: "Digimine for institutes — one platform for every batch and every teacher",
    description:
        "Onboard your teachers, manage classes, run institute-wide tests, and track every student. GST-compliant annual plans for coaching centres, colleges, and training institutes.",
    path: "/for-institutes",
    keywords: [
        "LMS for institutes",
        "coaching centre software",
        "online platform for schools India",
        "institute mock tests",
        "centralised question bank",
    ],
});

const FAQS = [
    {
        question: "Is there a free trial?",
        answer:
            "Every new institute starts on a 30-day Trial with 3 teachers, 60 students, and 5 classes. No card required.",
    },
    {
        question: "What happens to my existing teacher account?",
        answer:
            "Nothing changes. When you create an institute, your role is promoted to Institute Admin and you can switch between contexts.",
    },
    {
        question: "Do students pay separately?",
        answer:
            "No. The institute plan covers all student access for classes you create. Students do not pay separately.",
    },
    {
        question: "How does payment work?",
        answer:
            "We invoice annually in INR with GST. Pay by bank transfer or UPI against the invoice. Renewal reminders go to the billing contact you set.",
    },
];

export default function ForInstitutesLayout({ children }: { children: React.ReactNode }) {
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
