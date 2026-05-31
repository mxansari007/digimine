"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { HandIcon } from "@/components/icons/AppIcons";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { PageLoading } from "@/components/common";
import type { Product } from "@digimine/types";

interface ProductWithFiles {
    product: Product;
    files: {
        id: string;
        name: string;
        url: string;
        size?: string;
    }[];
}

export default function DownloadsPage() {
    const { user } = useAuthContext();
    const [purchasedItems, setPurchasedItems] = useState<ProductWithFiles[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user?.purchasedProducts || user.purchasedProducts.length === 0) {
            setLoading(false);
            return;
        }

        async function fetchDownloads() {
            try {
                const items: ProductWithFiles[] = [];

                for (const purchase of user!.purchasedProducts) {
                    const productId = typeof purchase === 'string' ? purchase : purchase.productId;

                    // Get product details
                    const productDoc = await getDoc(doc(db, "products", productId));
                    if (!productDoc.exists()) continue;

                    const product = productDoc.data() as Product;

                    // Get product files
                    const filesSnapshot = await getDocs(collection(db, "products", productId, "files"));
                    const files = filesSnapshot.docs.map(fileDoc => ({
                        id: fileDoc.id,
                        name: fileDoc.data().name || "File",
                        url: fileDoc.data().url,
                        size: fileDoc.data().size,
                    }));

                    items.push({ product: { ...product, id: productDoc.id }, files });
                }

                setPurchasedItems(items);
            } catch (err) {
                console.error("Error fetching downloads:", err);
            } finally {
                setLoading(false);
            }
        }

        fetchDownloads();
    }, [user?.purchasedProducts]);

    if (loading) {
        return <PageLoading variant="inline" />;
    }

    const userName = user?.firstName || user?.displayName?.split(' ')[0] || "there";

    return (
        <div className="space-y-8">
            {/* Personalized Header */}
            <div>
                <h1 className="font-display text-3xl font-bold text-gray-900 mb-2">
                    <span className="inline-flex items-center gap-2">
                        Welcome back, {userName}
                        <HandIcon className="h-7 w-7 text-primary-500" />
                    </span>
                </h1>
                <p className="text-gray-600 text-lg">
                    Access your premium content and assets below.
                </p>
            </div>

            {/* Content Grid */}
            {purchasedItems.length === 0 ? (
                <div className="text-center py-16 bg-gray-50 rounded-2xl border border-gray-100">
                    <div className="w-20 h-20 bg-white rounded-full shadow-sm flex items-center justify-center mx-auto mb-6">
                        <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">No products found</h3>
                    <p className="text-gray-500 mb-8 max-w-md mx-auto">
                        Your library is empty. Discover premium templates, courses, and assets in our marketplace.
                    </p>
                    <Link href="/products">
                        <Button variant="primary" size="lg" className="shadow-xl shadow-primary-500/20">
                            Explore Marketplace
                        </Button>
                    </Link>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {purchasedItems.map(({ product, files }) => (
                        <div key={product.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow duration-300 flex flex-col">

                            {/* Mobile Layout: Row for header, then files below */}
                            <div className="flex md:flex-col">
                                {/* Product Thumbnail */}
                                <div className="w-28 h-28 md:w-full md:h-48 bg-gray-100 relative flex-shrink-0">
                                    {product.thumbnailURL ? (
                                        <Image
                                            src={product.thumbnailURL}
                                            alt={product.name}
                                            fill
                                            sizes="(max-width: 768px) 112px, (max-width: 1200px) 50vw, 33vw"
                                            className="object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-gray-50 text-gray-300">
                                            <svg className="w-10 h-10 md:w-12 md:h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                        </div>
                                    )}
                                    <div className="hidden md:block absolute top-3 right-3">
                                        <span className="bg-white/90 backdrop-blur text-xs font-bold px-2 py-1 rounded-md text-gray-900 shadow-sm">
                                            {product.purchaseType === 'subscription' ? 'Sub' : 'Owned'}
                                        </span>
                                    </div>
                                </div>

                                {/* Header Info (Mobile Right / Desktop Below) */}
                                <div className="p-3 md:p-5 flex-1 flex flex-col justify-center min-w-0">
                                    <div className="flex items-start justify-between gap-2 mb-1">
                                        <h3 className="font-bold text-base md:text-lg text-gray-900 line-clamp-2 md:line-clamp-1 leading-tight">{product.name}</h3>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="md:hidden bg-gray-100 text-[10px] font-bold px-1.5 py-0.5 rounded text-gray-600 uppercase tracking-wide">
                                            {product.purchaseType === 'subscription' ? 'Sub' : 'Owned'}
                                        </span>
                                        <p className="text-xs text-gray-500">{files.length} {files.length === 1 ? 'File' : 'Files'}</p>
                                    </div>

                                    {/* Mobile: View Details Link inside header to save space */}
                                    <div className="mt-2 md:hidden">
                                        <Link href={`/products/${product.id}`} className="text-xs text-primary-600 font-medium">
                                            View Details →
                                        </Link>
                                    </div>
                                </div>
                            </div>

                            {/* Divider on mobile only */}
                            <div className="h-px bg-gray-100 md:hidden" />

                            {/* File List Section - Always visible */}
                            <div className="p-3 md:p-5 pt-0 md:pt-0 flex-1 flex flex-col bg-gray-50/30 md:bg-white">
                                <div className="space-y-2 mt-3 md:mt-2">
                                    {files.map(file => (
                                        <div key={file.id} className="flex items-center justify-between p-2 md:p-3 bg-white border border-gray-100 rounded-lg group hover:border-primary-200 hover:shadow-sm transition-all shadow-sm md:shadow-none">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0 text-primary-600">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                    </svg>
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                                                    {file.size ? <p className="text-xs text-gray-400">{file.size}</p> : null}
                                                </div>
                                            </div>

                                            <a
                                                href={file.url}
                                                download
                                                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-gray-400 transition-all duration-200 hover:bg-primary-50 hover:text-primary-600 active:scale-95"
                                                title="Download File"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                                </svg>
                                            </a>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-4 pt-3 border-t border-gray-100 hidden md:block">
                                    <Link href={`/products/${product.id}`} className="text-xs text-gray-500 hover:text-primary-600 flex items-center justify-center gap-1 group">
                                        View Product Details
                                        <svg className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </Link>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
