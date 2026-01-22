"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Button, Card } from "@digimine/ui";
import { type Order } from "@digimine/types";
import { formatCurrency } from "@digimine/utils";
import { sendMagicLink } from "@/lib/firebase/auth";

interface ProductFile {
    id: string;
    name: string;
    url: string;
    productName: string;
}

export default function SuccessPage() {
    const searchParams = useSearchParams();
    const orderId = searchParams.get("orderId");
    const [order, setOrder] = useState<Order | null>(null);
    const [files, setFiles] = useState<ProductFile[]>([]);
    const [loading, setLoading] = useState(!!orderId);
    const [isSendingLink, setIsSendingLink] = useState(false);

    useEffect(() => {
        if (!orderId) {
            setLoading(false);
            return;
        }

        async function fetchOrderAndFiles() {
            try {
                const snap = await getDoc(doc(db, "orders", orderId!));
                if (snap.exists()) {
                    const orderData = { id: snap.id, ...snap.data() } as Order;
                    setOrder(orderData);

                    // Fetch files for each product in the order
                    const allFiles: ProductFile[] = [];
                    for (const item of orderData.items) {
                        try {
                            const filesSnap = await getDocs(collection(db, "products", item.productId, "files"));
                            filesSnap.docs.forEach(fileDoc => {
                                allFiles.push({
                                    id: fileDoc.id,
                                    productName: item.productName,
                                    ...fileDoc.data() as { name: string; url: string }
                                });
                            });
                        } catch (e) {
                            // Files might not exist or not be accessible yet - that's okay
                            console.log(`No files found for ${item.productId}`);
                        }
                    }
                    setFiles(allFiles);
                }
            } catch (err) {
                console.error("Error fetching order", err);
            } finally {
                setLoading(false);
            }
        }
        fetchOrderAndFiles();
    }, [orderId]);

    if (loading) return <div className="p-20 text-center">Loading confirmation...</div>;

    if (!order) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <h1 className="text-2xl font-bold text-gray-900">Order not found</h1>
                    <Link href="/"><span className="text-primary-600 hover:underline mt-4 block">Return Home</span></Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-12">
            <div className="container-page max-w-2xl">
                <Card padding="lg" className="text-center">
                    <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                        <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>

                    <h1 className="font-display text-3xl font-bold text-gray-900 mb-2">
                        Thanks for your purchase!
                    </h1>
                    <p className="text-gray-600 mb-8">
                        We've sent a receipt to <span className="font-semibold text-gray-900">{order.customerEmail}</span>
                    </p>

                    <div className="bg-gray-50 rounded-xl p-6 mb-8 text-left">
                        <h3 className="font-semibold text-gray-900 mb-4">Your Downloads</h3>
                        <div className="space-y-3">
                            {files.length > 0 ? (
                                files.map((file) => (
                                    <div key={file.id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-200">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-primary-100 rounded flex items-center justify-center text-primary-600">
                                                📥
                                            </div>
                                            <div>
                                                <div className="font-medium text-gray-900">{file.name}</div>
                                                <div className="text-xs text-gray-500">{file.productName}</div>
                                            </div>
                                        </div>
                                        <a href={file.url} target="_blank" rel="noopener noreferrer">
                                            <Button size="sm" variant="primary">Download</Button>
                                        </a>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-4 text-gray-500">
                                    <p className="mb-2">To access your files, please create an account first.</p>
                                    <p className="text-sm">Click "Send Magic Link" below to get instant access.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="border-t border-gray-100 pt-8">
                        <h3 className="font-semibold text-gray-900 mb-2">Instant Access</h3>
                        <p className="text-sm text-gray-500 mb-4">
                            Get a secure magic link sent to your email to access your purchases anytime.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                            <Button
                                variant="primary"
                                onClick={async () => {
                                    setIsSendingLink(true);
                                    try {
                                        await sendMagicLink(order.customerEmail);
                                        alert(`Magic link sent to ${order.customerEmail}!`);
                                    } catch (e) {
                                        console.error(e);
                                        alert("Failed to send link. Please try again.");
                                    } finally {
                                        setIsSendingLink(false);
                                    }
                                }}
                                isLoading={isSendingLink}
                            >
                                Send Magic Link
                            </Button>
                            <Link href={`/register?email=${encodeURIComponent(order.customerEmail)}`}>
                                <Button variant="outline">
                                    Set Password
                                </Button>
                            </Link>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
}
