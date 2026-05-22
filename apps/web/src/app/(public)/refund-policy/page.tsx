import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
    title: "Refunds & Cancellations",
    description: "Digimine's refund and cancellation policy for digital products and test purchases.",
    path: "/refund-policy",
});

export default function RefundPolicyPage() {
    return (
        <div className="bg-gray-50 min-h-screen py-12">
            <div className="container-page max-w-4xl">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 md:p-12">
                    <h1 className="font-display text-3xl md:text-4xl font-bold text-gray-900 mb-8 border-b pb-6">
                        Refunds & Cancellations
                    </h1>

                    <div className="prose prose-blue max-w-none text-gray-600">
                        <p className="text-sm text-gray-400 mb-8">Last Updated: January 25, 2026</p>

                        <h3>1. Cancellation Policy</h3>
                        <p>
                            Due to the nature of digital products, which are instantly downloadable, we generally do not offer cancellations once the order is placed and the download link has been generated.
                        </p>

                        <h3>2. Refund Policy</h3>
                        <p>
                            We strive to provide high-quality digital assets. However, we understand that issues may arise.
                        </p>
                        <ul className="list-disc pl-5 space-y-2">
                            <li>
                                <strong>Non-refundable:</strong> Purchases of digital downloads are generally non-refundable once downloaded or accessed.
                            </li>
                            <li>
                                <strong>Exceptions:</strong> We may offer a refund if:
                                <ul className="list-circle pl-5 mt-2 space-y-1">
                                    <li>The file is corrupted or technically defective and cannot be fixed.</li>
                                    <li>The product is materially different from the description.</li>
                                    <li>A duplicate purchase was made accidentally.</li>
                                </ul>
                            </li>
                        </ul>

                        <h3>3. Requesting a Refund</h3>
                        <p>
                            To request a refund, please email us at <a href="mailto:support@digimine.shop" className="text-primary-600 no-underline hover:underline">support@digimine.shop</a> within 7 days of your purchase with your Order ID and a detailed description of the issue.
                        </p>

                        <h3>4. Processing Time</h3>
                        <p>
                            Approved refunds will be processed within 5-7 business days and credited back to the original payment method.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
