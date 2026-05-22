import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
    title: "Shipping & Delivery Policy",
    description: "How and when you receive access to your digital purchases on Digimine.",
    path: "/shipping-policy",
});

export default function ShippingPolicyPage() {
    return (
        <div className="bg-gray-50 min-h-screen py-12">
            <div className="container-page max-w-4xl">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 md:p-12">
                    <h1 className="font-display text-3xl md:text-4xl font-bold text-gray-900 mb-8 border-b pb-6">
                        Shipping &amp; Delivery Policy
                    </h1>

                    <div className="prose prose-blue max-w-none text-gray-600">
                        <p className="text-sm text-gray-400 mb-8">Last Updated: May 2, 2026</p>

                        <h3>1. Digital Delivery</h3>
                        <p>
                            Digimine sells digital products exclusively. All purchases are delivered electronically — there is no physical shipping involved.
                        </p>

                        <h3>2. Delivery Method</h3>
                        <p>
                            Upon successful payment, your digital products will be made available for immediate download through your account dashboard. You will also receive a confirmation email with access details.
                        </p>

                        <h3>3. Delivery Timeframe</h3>
                        <ul className="list-disc pl-5 space-y-2">
                            <li>
                                <strong>Instant Downloads:</strong> Most digital products are available for download immediately after payment confirmation.
                            </li>
                            <li>
                                <strong>Subscription Products:</strong> Access to subscription-based products is granted instantly upon successful payment and remains active for the duration of your subscription period.
                            </li>
                        </ul>

                        <h3>4. Access &amp; Re-downloads</h3>
                        <p>
                            You can access and re-download your purchased products at any time by logging into your Digimine account and visiting your orders section.
                        </p>

                        <h3>5. Delivery Issues</h3>
                        <p>
                            If you experience any issues accessing or downloading your purchased products, please contact us at{" "}
                            <a href="mailto:support@digimine.shop" className="text-primary-600 no-underline hover:underline">
                                support@digimine.shop
                            </a>{" "}
                            with your Order ID and a description of the issue. Our support team will respond within 24–48 business hours.
                        </p>

                        <h3>6. No Physical Shipping</h3>
                        <p>
                            As all our products are digital, we do not ship any physical goods. No shipping charges apply to any orders on Digimine.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
