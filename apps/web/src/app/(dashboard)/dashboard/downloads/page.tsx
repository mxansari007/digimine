import { Card } from "@digimine/ui";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Downloads",
};

export default function DownloadsPage() {
    return (
        <div>
            {/* Header */}
            <div className="mb-8">
                <h1 className="font-display text-2xl font-bold text-gray-900 mb-2">
                    Downloads
                </h1>
                <p className="text-gray-600">
                    Download your purchased digital products
                </p>
            </div>

            {/* Downloads List */}
            <Card padding="lg">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="font-display text-lg font-semibold text-gray-900">
                        Available Downloads
                    </h2>
                    <div className="text-sm text-gray-500">0 items</div>
                </div>

                {/* Empty State */}
                <div className="text-center py-12">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg
                            className="w-8 h-8 text-gray-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                            />
                        </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                        No downloads available
                    </h3>
                    <p className="text-gray-500 mb-6">
                        Downloads will appear here after you purchase a product.
                    </p>
                    <a
                        href="/products"
                        className="inline-flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium"
                    >
                        Browse Products
                        <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M17 8l4 4m0 0l-4 4m4-4H3"
                            />
                        </svg>
                    </a>
                </div>

                {/* Download items would be listed here */}
                {/* Example download item structure:
        <div className="border border-gray-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-500">...</svg>
            </div>
            <div>
              <h3 className="font-medium text-gray-900">Product Name</h3>
              <p className="text-sm text-gray-500">PDF • 2.4 MB</p>
            </div>
          </div>
          <Button variant="outline" size="sm">Download</Button>
        </div>
        */}
            </Card>

            {/* Download Instructions */}
            <Card padding="lg" className="mt-6">
                <h3 className="font-semibold text-gray-900 mb-4">Download Tips</h3>
                <ul className="space-y-3 text-gray-600">
                    <li className="flex items-start gap-3">
                        <svg
                            className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                        >
                            <path
                                fillRule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                clipRule="evenodd"
                            />
                        </svg>
                        <span>
                            Download links are available for lifetime access after purchase.
                        </span>
                    </li>
                    <li className="flex items-start gap-3">
                        <svg
                            className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                        >
                            <path
                                fillRule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                clipRule="evenodd"
                            />
                        </svg>
                        <span>
                            Some products may have multiple files. Make sure to download all
                            of them.
                        </span>
                    </li>
                    <li className="flex items-start gap-3">
                        <svg
                            className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                        >
                            <path
                                fillRule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                clipRule="evenodd"
                            />
                        </svg>
                        <span>
                            If you have any issues downloading, please contact support.
                        </span>
                    </li>
                </ul>
            </Card>
        </div>
    );
}
