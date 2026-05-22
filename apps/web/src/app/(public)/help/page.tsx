import type { Metadata } from "next";
import Link from "next/link";
import { Card, Button } from "@digimine/ui";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
    title: "Help Center & FAQ",
    description: "Answers to common questions about purchases, downloads, tests, and accounts on PlacementRanker.",
    path: "/help",
});

const FAQS = [
    {
        question: "How do I access my digital products after purchase?",
        answer: "Once your payment is successful, you will receive an email with an access key. You can use this key on our website to download your products. Alternatively, if you have an account, all your purchases will be available in your dashboard under the 'Downloads' section."
    },
    {
        question: "What is an Access Key?",
        answer: "An Access Key is a unique identifier generated for every order. It allows you to view and download your digital products without needing to log in. Keep this key safe as it is your proof of purchase."
    },
    {
        question: "Can I get a refund for my purchase?",
        answer: "Due to the nature of digital products, we generally do not offer refunds once the product has been accessed or downloaded. However, if you experience technical issues, please contact our support team within 7 days of purchase."
    },
    {
        question: "Are there any limits on downloads?",
        answer: "No, once you purchase a product, you have lifetime access to it. You can download it as many times as you need from your dashboard or using your access key."
    },
    {
        question: "I haven't received my access key email. What should I do?",
        answer: "First, please check your spam or junk folder. If you still can't find it, ensure your payment was successful. You can contact our support team at support@digimine.shop with your transaction ID, and we will manually resend your key."
    },
    {
        question: "Can I use the products for commercial purposes?",
        answer: "License terms vary by product. Please check the 'License' section on the individual product page for specific details regarding personal vs. commercial usage."
    }
];

export default function HelpPage() {
    return (
        <div className="bg-gray-50 min-h-screen py-12">
            <div className="container-page max-w-4xl">
                {/* Header */}
                <div className="text-center mb-12">
                    <h1 className="font-display text-4xl font-bold text-gray-900 mb-4">
                        How can we help you?
                    </h1>
                    <p className="text-xl text-gray-600">
                        Find answers to common questions or get in touch with our team.
                    </p>
                </div>

                {/* FAQ Section */}
                <div className="space-y-6 mb-16">
                    <h2 className="text-2xl font-bold text-gray-900 mb-8 flex items-center gap-2">
                        <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Frequently Asked Questions
                    </h2>
                    
                    <div className="grid gap-6">
                        {FAQS.map((faq, index) => (
                            <Card key={index} padding="lg" className="border-none shadow-sm hover:shadow-md transition-shadow">
                                <h3 className="font-semibold text-gray-900 text-lg mb-2">
                                    {faq.question}
                                </h3>
                                <p className="text-gray-600 leading-relaxed">
                                    {faq.answer}
                                </p>
                            </Card>
                        ))}
                    </div>
                </div>

                {/* Contact CTA */}
                <div className="bg-primary-600 rounded-2xl shadow-lg text-white p-8 md:p-12 text-center overflow-hidden relative">
                    <div className="relative z-10">
                        <h2 className="font-display text-3xl font-bold text-white mb-4">
                            Still have questions?
                        </h2>
                        <p className="text-blue-100 text-lg mb-8 max-w-2xl mx-auto">
                            Our support team is always ready to assist you with any technical issues or purchase inquiries.
                        </p>
                        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                            <Link href="/contact">
                                <Button variant="secondary" size="lg">
                                    Contact Support
                                </Button>
                            </Link>
                            <a href="mailto:support@digimine.shop">
                                <Button variant="outline" size="lg" className="!border-white !text-white !bg-transparent hover:!bg-white hover:!text-primary-600">
                                    Email Us directly
                                </Button>
                            </a>
                        </div>
                    </div>
                    
                    {/* Background Decorative Circles */}
                    <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-64 h-64 bg-primary-500 rounded-full opacity-30 blur-3xl" />
                    <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/2 w-64 h-64 bg-primary-700 rounded-full opacity-30 blur-3xl" />
                </div>
            </div>
        </div>
    );
}
