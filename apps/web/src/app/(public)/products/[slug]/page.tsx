"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { getProductBySlug } from "@/lib/firestore";
import { Button } from "@digimine/ui";
import { formatCurrency } from "@digimine/utils";
import { useCart } from "@/contexts/CartContext";
import type { Product, ContentPreviewItem, DeliveryFormat } from "@digimine/types";

// Delivery format labels
const deliveryFormatLabels: Record<DeliveryFormat, string> = {
    pdf: "PDF Download",
    video: "Video Course",
    audio: "Audio Files",
    zip: "ZIP Archive",
    online: "Online Access",
    software: "Software",
    other: "Digital Download",
};

export default function ProductDetailPage({ params }: { params: { slug: string } }) {
    const { addItem, openDrawer } = useCart();
    const router = useRouter();
    const [product, setProduct] = useState<Product | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedImageIndex, setSelectedImageIndex] = useState(0);
    const [showFloatingCTA, setShowFloatingCTA] = useState(false);
    const ctaRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        async function fetchProduct() {
            try {
                const p = await getProductBySlug(params.slug);
                setProduct(p);
            } catch (err) {
                console.error("Error fetching product", err);
            } finally {
                setLoading(false);
            }
        }
        fetchProduct();
    }, [params.slug]);

    // Scroll observer for floating CTA
    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                // Show floating CTA when main CTA is not visible
                setShowFloatingCTA(!entry.isIntersecting);
            },
            { threshold: 0, rootMargin: "-100px 0px 0px 0px" }
        );

        if (ctaRef.current) {
            observer.observe(ctaRef.current);
        }

        return () => observer.disconnect();
    }, [product]);

    const handleBuyNow = () => {
        if (!product) return;
        addItem({
            productId: product.id,
            productName: product.name,
            price: product.price,
            quantity: 1,
            productImage: product.thumbnailURL || null
        });
        router.push("/checkout");
    };

    const handleAddToCart = () => {
        if (!product) return;
        addItem({
            productId: product.id,
            productName: product.name,
            price: product.price,
            quantity: 1,
            productImage: product.thumbnailURL || null
        });
        openDrawer();
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent mx-auto mb-4" />
                    <p className="text-gray-500">Loading product...</p>
                </div>
            </div>
        );
    }

    if (!product) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-50">
                <div className="text-6xl mb-4">😕</div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Product Not Found</h1>
                <p className="text-gray-600 mb-6">The product you're looking for doesn't exist.</p>
                <Button onClick={() => router.push("/products")}>Browse Products</Button>
            </div>
        );
    }

    // Calculate savings
    const hasDiscount = product.compareAtPrice && product.compareAtPrice > product.price;
    const savingsPercent = hasDiscount
        ? Math.round(((product.compareAtPrice! - product.price) / product.compareAtPrice!) * 100)
        : 0;
    const savingsAmount = hasDiscount ? product.compareAtPrice! - product.price : 0;

    // Build gallery images
    const galleryImages = product.images?.length > 0
        ? product.images
        : product.thumbnailURL
            ? [product.thumbnailURL]
            : [];
    const currentImage = galleryImages[selectedImageIndex] || null;

    return (
        <div className="bg-white min-h-screen">
            {/* Back Button */}
            <div className="container-page py-3">
                <button
                    onClick={() => router.back()}
                    className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back
                </button>
            </div>

            <div className="container-page py-6 lg:py-10">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10">
                    {/* Product Gallery - Left Side */}
                    <div className="lg:col-span-7 space-y-4">
                        {/* Main Image */}
                        <div className="bg-gray-100 rounded-2xl aspect-square relative overflow-hidden">
                            {/* Discount Badge */}
                            {hasDiscount && (
                                <div className="absolute top-4 left-4 z-10">
                                    <div className="bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg">
                                        <div className="text-xs font-medium">SAVE {savingsPercent}%</div>
                                        <div className="text-lg font-bold">{formatCurrency(savingsAmount)} OFF</div>
                                    </div>
                                </div>
                            )}

                            {/* Instant Access Badge */}
                            {product.instantAccess && (
                                <div className="absolute top-4 right-4 z-10 bg-green-500 text-white px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-1.5">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                    </svg>
                                    <span className="font-semibold text-sm">Instant Access</span>
                                </div>
                            )}

                            {currentImage ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={currentImage}
                                    alt={product.name}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-gray-300">
                                    <svg className="w-32 h-32" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                </div>
                            )}
                        </div>

                        {/* Thumbnail Gallery */}
                        {galleryImages.length > 1 && (
                            <div className="flex gap-2 overflow-x-auto pb-2">
                                {galleryImages.map((img, index) => (
                                    <button
                                        key={index}
                                        onClick={() => setSelectedImageIndex(index)}
                                        className={`flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden border-2 transition-all ${selectedImageIndex === index
                                            ? "border-primary-600 ring-2 ring-primary-200"
                                            : "border-gray-200 hover:border-gray-300"
                                            }`}
                                    >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={img} alt={`${product.name} ${index + 1}`} className="w-full h-full object-cover" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Product Details - Right Side */}
                    <div className="lg:col-span-5 space-y-6">
                        {/* Category & Type Badges */}
                        <div className="flex flex-wrap gap-2">
                            <span className="px-3 py-1 bg-primary-50 text-primary-700 rounded-full text-sm font-semibold">
                                {product.type.charAt(0).toUpperCase() + product.type.slice(1)}
                            </span>
                            {product.deliveryFormat && (
                                <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm font-medium flex items-center gap-1">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                                    </svg>
                                    {deliveryFormatLabels[product.deliveryFormat]}
                                </span>
                            )}
                        </div>

                        {/* Title */}
                        <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 leading-tight">
                            {product.name}
                        </h1>

                        {/* Short Description */}
                        {product.shortDescription && (
                            <p className="text-lg text-gray-600 leading-relaxed">{product.shortDescription}</p>
                        )}

                        {/* Price Section */}
                        <div className="bg-gray-50 rounded-2xl p-5">
                            <div className="flex items-end gap-3 mb-2">
                                <span className="text-4xl font-bold text-gray-900">
                                    {formatCurrency(product.price)}
                                </span>
                                {hasDiscount && (
                                    <span className="text-xl text-gray-400 line-through mb-1">
                                        {formatCurrency(product.compareAtPrice!)}
                                    </span>
                                )}
                            </div>
                            {hasDiscount && (
                                <div className="flex items-center gap-2">
                                    <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-sm font-bold">
                                        {savingsPercent}% OFF
                                    </span>
                                    <span className="text-sm text-gray-600">
                                        You save {formatCurrency(savingsAmount)}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* CTA Buttons - This is the reference element for floating CTA */}
                        <div ref={ctaRef} className="space-y-3">
                            <Button
                                size="lg"
                                variant="primary"
                                className="w-full text-lg py-4 shadow-xl shadow-primary-200/50 hover:shadow-2xl hover:shadow-primary-300/50 transition-shadow"
                                onClick={handleBuyNow}
                            >
                                Buy Now • {formatCurrency(product.price)}
                            </Button>
                            <Button
                                size="lg"
                                variant="outline"
                                className="w-full text-lg py-4"
                                onClick={handleAddToCart}
                            >
                                Add to Cart
                            </Button>
                            <p className="text-center text-sm text-gray-500">
                                Secure checkout • Instant access after payment
                            </p>
                        </div>

                        {/* Money Back Guarantee */}
                        {product.moneyBackGuarantee > 0 && (
                            <div className="flex items-center gap-4 p-4 bg-green-50 border border-green-100 rounded-xl">
                                <div className="p-3 bg-green-100 rounded-full flex-shrink-0">
                                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="font-bold text-green-800">
                                        {product.moneyBackGuarantee}-Day Money-Back Guarantee
                                    </p>
                                    <p className="text-sm text-green-700">
                                        Not satisfied? Full refund, no questions asked.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Key Highlights */}
                        {product.highlights && product.highlights.length > 0 && (
                            <div className="space-y-4">
                                <h3 className="font-bold text-gray-900 text-lg">What You'll Get:</h3>
                                <ul className="space-y-3">
                                    {product.highlights.map((highlight, index) => (
                                        <li key={index} className="flex items-start gap-3">
                                            <div className="mt-0.5 p-1 bg-green-100 rounded-full flex-shrink-0">
                                                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                            </div>
                                            <span className="text-gray-700">{highlight}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Trust Badges */}
                        <div className="grid grid-cols-2 gap-3 pt-4">
                            <div className="flex items-center gap-2 text-gray-600">
                                <svg className="w-5 h-5 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                                <span className="text-sm font-medium">Secure Payment</span>
                            </div>
                            <div className="flex items-center gap-2 text-gray-600">
                                <svg className="w-5 h-5 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                                </svg>
                                <span className="text-sm font-medium">Instant Download</span>
                            </div>
                            <div className="flex items-center gap-2 text-gray-600">
                                <svg className="w-5 h-5 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span className="text-sm font-medium">Lifetime Access</span>
                            </div>
                            <div className="flex items-center gap-2 text-gray-600">
                                <svg className="w-5 h-5 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                                </svg>
                                <span className="text-sm font-medium">Email Support</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Full Description & Content Preview Section */}
                <div className="mt-12 lg:mt-16 grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
                    {/* Description */}
                    <div className="lg:col-span-2">
                        <h2 className="text-2xl font-bold text-gray-900 mb-6">About This Product</h2>
                        <div className="prose prose-gray max-w-none">
                            <p className="whitespace-pre-wrap text-gray-600 leading-relaxed text-lg">
                                {product.description}
                            </p>
                        </div>
                    </div>

                    {/* What's Included */}
                    {product.contentPreview && product.contentPreview.length > 0 && (
                        <div className="lg:col-span-1">
                            <div className="bg-gray-50 rounded-2xl p-6 sticky top-20">
                                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                                    <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    What's Included
                                </h2>
                                <div className="space-y-1">
                                    <ContentTreeView items={product.contentPreview} depth={0} />
                                </div>
                                <div className="mt-4 pt-4 border-t border-gray-200 flex items-center justify-center gap-2 text-sm text-gray-500">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                    Purchase to unlock
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Floating CTA Bar - Appears when main CTAs scroll out of view */}
            <div
                className={`fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] z-40 transform transition-transform duration-300 ${showFloatingCTA ? "translate-y-0" : "translate-y-full"
                    }`}
            >
                <div className="container-page py-3">
                    <div className="flex items-center gap-4">
                        {/* Product Info */}
                        <div className="hidden sm:block flex-shrink-0">
                            <p className="font-semibold text-gray-900 line-clamp-1">{product.name}</p>
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-lg text-gray-900">{formatCurrency(product.price)}</span>
                                {hasDiscount && (
                                    <span className="text-sm text-gray-400 line-through">{formatCurrency(product.compareAtPrice!)}</span>
                                )}
                            </div>
                        </div>

                        {/* Mobile Price Only */}
                        <div className="sm:hidden flex-shrink-0">
                            <div className="flex items-baseline gap-2">
                                <span className="font-bold text-xl text-gray-900">{formatCurrency(product.price)}</span>
                                {hasDiscount && (
                                    <span className="text-sm text-gray-400 line-through">{formatCurrency(product.compareAtPrice!)}</span>
                                )}
                            </div>
                        </div>

                        {/* Spacer */}
                        <div className="flex-1" />

                        {/* Buttons */}
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="md"
                                className="hidden sm:flex"
                                onClick={handleAddToCart}
                            >
                                Add to Cart
                            </Button>
                            <Button
                                variant="primary"
                                size="md"
                                className="px-6 shadow-lg shadow-primary-200/50"
                                onClick={handleBuyNow}
                            >
                                <span className="hidden sm:inline">Buy Now</span>
                                <span className="sm:hidden">Buy • {formatCurrency(product.price)}</span>
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom padding to prevent content being hidden by floating CTA */}
            <div className="h-20" />
        </div>
    );
}

// Recursive content tree components
function ContentTreeView({ items, depth }: { items: ContentPreviewItem[]; depth: number }) {
    return (
        <div className="space-y-0.5">
            {items.map((item) => (
                <ContentTreeItem key={item.id} item={item} depth={depth} />
            ))}
        </div>
    );
}

function ContentTreeItem({ item, depth }: { item: ContentPreviewItem; depth: number }) {
    return (
        <div style={{ paddingLeft: depth > 0 ? 16 : 0 }}>
            <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-gray-100 transition-colors">
                {item.type === "folder" ? (
                    <svg className="w-4 h-4 text-yellow-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                    </svg>
                ) : (
                    <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                )}
                <span className={`flex-1 text-sm ${depth === 0 ? "font-medium text-gray-700" : "text-gray-600"}`}>
                    {item.name}
                </span>
                <svg className="w-3 h-3 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
            </div>
            {item.type === "folder" && item.children && item.children.length > 0 && (
                <div className="border-l-2 border-gray-200 ml-2">
                    <ContentTreeView items={item.children} depth={depth + 1} />
                </div>
            )}
        </div>
    );
}
