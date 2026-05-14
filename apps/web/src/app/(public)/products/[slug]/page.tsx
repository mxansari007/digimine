"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getProductBySlug, getProductReviewStats } from "@/lib/firestore";
import { viewContent, addToCart } from "@/lib/fpixel";
import { Button } from "@digimine/ui";
import { formatCurrency } from "@digimine/utils";
import { useAuthContext } from "@/contexts/AuthContext";
import { ReviewSection } from "@/components/reviews/ReviewSection";
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
    const { user } = useAuthContext();
    const router = useRouter();
    const [product, setProduct] = useState<Product | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedImageIndex] = useState(0);
    const [showFloatingCTA, setShowFloatingCTA] = useState(false);
    const [ratingStats, setRatingStats] = useState<{ averageRating: number; reviewCount: number }>({ averageRating: 0, reviewCount: 0 });
    const ctaRef = useRef<HTMLDivElement>(null);

    // Inline check for ownership and expiration
    const purchases = user?.purchasedProducts || [];

    // Check active access
    const hasAccess = product && purchases.some((p: any) => {
        if (typeof p === 'string') return p === product.id;
        return p.productId === product.id && (p.expiresAt === null || new Date(p.expiresAt) > new Date());
    });

    // Check if subscription expired
    const isExpired = product?.purchaseType === 'subscription' && !hasAccess && purchases.some((p: any) => {
        return typeof p !== 'string' && p.productId === product.id && p.expiresAt && new Date(p.expiresAt) <= new Date();
    });

    useEffect(() => {
        async function fetchProduct() {
            try {
                const p = await getProductBySlug(params.slug);
                setProduct(p);
                // Fire ViewContent event
                if (p) {
                    viewContent({
                        id: p.id,
                        name: p.name,
                        category: p.type,
                        price: p.price,
                    });
                    const stats = await getProductReviewStats(p.id);
                    setRatingStats(stats);
                }
            } catch (err) {
                console.error("Error fetching product", err);
            } finally {
                setLoading(false);
            }
        }
        fetchProduct();
    }, [params.slug]);

    // Scroll listener for floating CTA stability
    useEffect(() => {
        const handleScroll = () => {
            if (!ctaRef.current) return;
            const rect = ctaRef.current.getBoundingClientRect();
            // Show only when the BOTTOM of the main CTA container has scrolled up past the top of the viewport (with a small buffer)
            const isScrolledPast = rect.bottom < 0;
            setShowFloatingCTA(isScrolledPast);
        };

        // Check on mount and add listener
        handleScroll();
        window.addEventListener("scroll", handleScroll, { passive: true });

        return () => window.removeEventListener("scroll", handleScroll);
    }, [product]);

    const handleBuyNow = () => {
        if (!product) return;
        // Fire AddToCart event before navigating to checkout
        addToCart({
            id: product.id,
            name: product.name,
            category: product.type,
            price: product.price,
            quantity: 1,
        });
        router.push(`/checkout?productId=${product.id}`);
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
                <p className="text-gray-600 mb-6">The product you&apos;re looking for doesn&apos;t exist.</p>
                <Button onClick={() => router.push("/products")}>Browse Products</Button>
            </div>
        );
    }

    // Calculate savings
    const hasDiscount = product.compareAtPrice && product.compareAtPrice > product.price;
    const savingsPercent = hasDiscount
        ? Math.round(((product.compareAtPrice! - product.price) / product.compareAtPrice!) * 100)
        : 0;


    // Build gallery images
    const galleryImages = product.images?.length > 0
        ? product.images
        : product.thumbnailURL
            ? [product.thumbnailURL]
            : [];
    const currentImage = galleryImages[selectedImageIndex] || null;

    return (
        <div className="bg-white min-h-screen font-sans selection:bg-primary-100 selection:text-primary-900">
            {/* Ambient Background - Deeper and more sophisticated */}
            <div className="fixed inset-0 pointer-events-none opacity-30 z-0">
                <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-primary-100/40 rounded-full blur-[120px] mix-blend-multiply animate-blob" />
                <div className="absolute top-[20%] -left-[200px] w-[600px] h-[600px] bg-blue-100/40 rounded-full blur-[120px] mix-blend-multiply animate-blob animation-delay-2000" />
                <div className="absolute bottom-0 right-[20%] w-[500px] h-[500px] bg-purple-100/40 rounded-full blur-[120px] mix-blend-multiply animate-blob animation-delay-4000" />
            </div>

            {/* Back Button - Minimalist */}
            <div className="absolute top-4 left-4 z-50">
                <button
                    onClick={() => router.back()}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 backdrop-blur-md border border-gray-200 text-sm font-medium text-gray-600 hover:text-gray-900 hover:border-gray-300 transition-all shadow-sm hover:shadow-md group"
                >
                    <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back to Products
                </button>
            </div>

            {/* SECTION 1: HERO - High Impact, Centered, Visual */}
            <section className="relative z-10 pt-24 pb-16 lg:pt-32 lg:pb-24 overflow-hidden">
                <div className="container-page max-w-7xl mx-auto">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">

                        {/* Hero Content - Left */}
                        <div className="space-y-8 text-center lg:text-left">
                            {/* Badges */}
                            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3">
                                <span className="px-3 py-1 bg-primary-600 text-white rounded-full text-xs font-bold uppercase tracking-wider shadow-lg shadow-primary-500/30">
                                    {product.type}
                                </span>
                                {ratingStats.reviewCount > 0 && (
                                    <div className="flex items-center gap-1.5 px-3 py-1 bg-white text-yellow-700 rounded-full text-xs font-bold border border-yellow-200 shadow-sm">
                                        <svg className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" viewBox="0 0 20 20">
                                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                        </svg>
                                        {ratingStats.averageRating} <span className="opacity-60 font-normal">({ratingStats.reviewCount} reviews)</span>
                                    </div>
                                )}
                            </div>

                            {/* Headline */}
                            <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold text-gray-900 leading-[1.05] tracking-tight text-balance">
                                {product.name}
                            </h1>

                            {/* Subheadline/Short Description */}
                            {product.shortDescription && (
                                <p className="text-xl text-gray-600 leading-relaxed max-w-2xl mx-auto lg:mx-0 text-balance">
                                    {product.shortDescription}
                                </p>
                            )}

                            {/* Pricing & CTA */}
                            <div className="flex flex-col items-center lg:items-start gap-6 pt-4">
                                <div className="flex items-end gap-3">
                                    <span className="text-6xl font-bold text-gray-900 tracking-tighter">
                                        {formatCurrency(product.price)}
                                    </span>
                                    {hasDiscount && (
                                        <div className="flex flex-col items-start mb-2">
                                            <span className="text-xl text-gray-400 line-through font-medium">
                                                {formatCurrency(product.compareAtPrice!)}
                                            </span>
                                            <span className="text-sm font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded">
                                                SAVE {savingsPercent}%
                                            </span>
                                        </div>
                                    )}
                                </div>

                                <div ref={ctaRef} className="w-full max-w-md space-y-3">
                                    {hasAccess ? (
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg justify-center lg:justify-start">
                                                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                                <span className="text-green-800 font-bold">You own this product</span>
                                            </div>
                                            <Link href="/dashboard/downloads" className="inline-flex items-center justify-center font-medium rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 bg-primary-600 text-white hover:bg-primary-700 w-full text-xl py-6 shadow-xl shadow-primary-500/30">
                                                Access Content
                                            </Link>
                                        </div>
                                    ) : (
                                        <>
                                            <Button
                                                size="lg"
                                                variant="primary"
                                                className="w-full text-xl py-6 shadow-2xl shadow-primary-600/30 hover:shadow-primary-600/50 hover:-translate-y-1 transition-all relative overflow-hidden group/btn"
                                                onClick={handleBuyNow}
                                            >
                                                <div className="absolute inset-0 -translate-x-full group-hover/btn:translate-x-full transition-transform duration-1000 ease-in-out bg-gradient-to-r from-transparent via-white/40 to-transparent z-10" />
                                                <span className="relative z-20 font-bold flex items-center justify-center gap-2">
                                                    Get Instant Access
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                                    </svg>
                                                </span>
                                            </Button>
                                            {isExpired && (
                                                <p className="text-center text-red-600 font-medium text-sm">Your subscription has expired</p>
                                            )}
                                        </>
                                    )}
                                    <p className="text-center lg:text-left text-sm text-gray-500">
                                        <span className="inline-flex items-center gap-1">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                            Secure Payment
                                        </span>
                                        <span className="mx-2">•</span>
                                        <span className="inline-flex items-center gap-1">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                            Instant Delivery
                                        </span>
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Hero Image - Right */}
                        <div className="relative">
                            <div className="relative aspect-[4/3] rounded-3xl overflow-hidden shadow-2xl shadow-gray-900/10 border-4 border-white/50 bg-white group hover:scale-[1.02] transition-transform duration-500">
                                {currentImage ? (

                                    <Image
                                        src={currentImage}
                                        alt={product.name}
                                        fill
                                        sizes="(max-width: 768px) 100vw, 50vw"
                                        className="object-cover transform group-hover:scale-110 transition-transform duration-1000 ease-out"
                                    />
                                ) : (
                                    <div className="absolute inset-0 flex items-center justify-center text-gray-300 bg-gray-50">
                                        <svg className="w-32 h-32 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                    </div>
                                )}
                                {/* Overlay Gradient */}
                                <div className="absolute inset-0 bg-gradient-to-tr from-primary-900/10 to-transparent pointer-events-none" />
                            </div>

                            {/* Floating Elements/Decorations */}
                            {product.deliveryFormat && (
                                <div className="absolute -bottom-6 -left-6 bg-white p-4 rounded-2xl shadow-xl border border-gray-100 flex items-center gap-3 animate-float delay-1000">
                                    <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Format</p>
                                        <p className="font-bold text-gray-900">{deliveryFormatLabels[product.deliveryFormat]}</p>
                                    </div>
                                </div>
                            )}

                            {product.moneyBackGuarantee > 0 && (
                                <div className="absolute -top-6 -right-6 bg-white p-4 rounded-2xl shadow-xl border border-gray-100 flex items-center gap-3 animate-float">
                                    <div className="p-2 bg-green-50 rounded-lg text-green-600">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Guarantee</p>
                                        <p className="font-bold text-gray-900">{product.moneyBackGuarantee} Days</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            {/* SECTION 2: TRUST BAR */}
            < div className="bg-gray-50 border-y border-gray-200 py-6 relative z-10" >
                <div className="container-page">
                    <div className="flex flex-wrap items-center justify-center lg:justify-between gap-6 opacity-70 grayscale hover:grayscale-0 transition-all duration-500">
                        <div className="flex items-center gap-2">
                            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                            <span className="font-semibold">Secure SSL Payment</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                            <span className="font-semibold">Instant Digital Download</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-2xl tracking-tighter text-blue-800">Razorpay</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-2xl tracking-tighter italic">PayPal</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-xl tracking-tighter">VISA</span>
                        </div>
                    </div>
                </div>
            </div >

            {/* SECTION 3: HIGHLIGHTS - Visual Grid */}
            {
                product.highlights && product.highlights.length > 0 && (
                    <section className="py-20 lg:py-28 relative z-10">
                        <div className="container-page">
                            <div className="text-center max-w-3xl mx-auto mb-16">
                                <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-6">Everything You Need to Succeed</h2>
                                <p className="text-xl text-gray-600">This isn&apos;t just a product. It&apos;s a complete toolkit designed to help you achieve your goals faster.</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                {product.highlights.map((highlight, index) => (
                                    <div key={index} className="bg-white p-8 rounded-3xl border border-gray-100 shadow-lg shadow-gray-200/50 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                                        <div className="w-12 h-12 bg-primary-100 text-primary-600 rounded-2xl flex items-center justify-center mb-6">
                                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                        </div>
                                        <h3 className="text-xl font-bold text-gray-900 mb-3">Feature Benefit {index + 1}</h3>
                                        <p className="text-gray-600 leading-relaxed font-medium">
                                            {highlight}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>
                )
            }
            {/* SECTION 4: CONTENT PREVIEW - Full Width Dark Section */}
            {
                product.contentPreview && product.contentPreview.length > 0 && (
                    <section className="py-20 lg:py-32 bg-gray-900 text-white relative overflow-hidden">
                        {/* Background effects */}
                        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent" />
                        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
                        <div className="absolute -top-[300px] -right-[300px] w-[600px] h-[600px] bg-primary-500/20 rounded-full blur-[150px]" />

                        <div className="container-page relative z-10">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
                                <div className="order-2 lg:order-1">
                                    <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 lg:p-8 border border-gray-700 shadow-2xl">
                                        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-700">
                                            <div className="flex gap-2">
                                                <div className="w-3 h-3 rounded-full bg-red-500" />
                                                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                                                <div className="w-3 h-3 rounded-full bg-green-500" />
                                            </div>
                                            <span className="text-gray-400 text-sm font-mono ml-2">package_contents.zip</span>
                                        </div>
                                        <div className="max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                            <ContentTreeView items={product.contentPreview} depth={0} theme="dark" />
                                        </div>
                                    </div>
                                </div>

                                <div className="order-1 lg:order-2 space-y-6">
                                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary-900/50 border border-primary-500/30 rounded-full text-primary-300 text-sm font-bold uppercase tracking-wider">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                                        Peek Inside
                                    </div>
                                    <h2 className="text-3xl lg:text-5xl font-bold font-display leading-tight text-white">
                                        What&apos;s Included in Your Download?
                                    </h2>
                                    <p className="text-lg text-gray-400 leading-relaxed max-w-xl">
                                        Stop guessing. Here&apos;s exactly what you&apos;ll find inside. Everything is organized, labeled, and ready to use immediately.
                                    </p>
                                    <ul className="space-y-4 pt-4">
                                        <li className="flex items-center gap-3 text-gray-300">
                                            <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center text-green-400">
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                            </div>
                                            Instant Delivery (ZIP/PDF)
                                        </li>
                                        <li className="flex items-center gap-3 text-gray-300">
                                            <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center text-green-400">
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                            </div>
                                            Lifetime Access & Updates
                                        </li>
                                        <li className="flex items-center gap-3 text-gray-300">
                                            <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center text-green-400">
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                            </div>
                                            Mobile & Desktop Friendly
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </section>
                )
            }

            {/* SECTION 5: DESCRIPTION - Long Form Prose */}
            <section className="py-20 lg:py-32 relative">
                <div className="container-page max-w-4xl mx-auto">
                    <div className="text-center mb-16">
                        <span className="text-primary-600 font-bold uppercase tracking-widest text-sm mb-2 block">Deep Dive</span>
                        <h2 className="text-3xl lg:text-4xl font-bold text-gray-900">About This Product</h2>
                    </div>

                    <div className="prose prose-lg prose-gray max-w-none first-letter:text-5xl first-letter:font-bold first-letter:text-primary-600 first-letter:mr-3 first-letter:float-left">
                        <p className="whitespace-pre-wrap leading-relaxed text-gray-600 text-lg">
                            {product.description}
                        </p>
                    </div>

                    {/* Interactive FAQ - Accordion style */}
                    <div className="mt-20 pt-16 border-t border-gray-100">
                        <h3 className="text-2xl font-bold text-gray-900 mb-8 text-center">Frequently Asked Questions</h3>
                        <div className="grid gap-4 max-w-3xl mx-auto">
                            <details className="group bg-gray-50 rounded-2xl p-2 cursor-pointer transition-all duration-300 open:bg-white open:shadow-lg open:ring-1 open:ring-gray-200">
                                <summary className="flex items-center justify-between p-4 font-bold text-gray-900 list-none text-lg">
                                    How do I access my purchase?
                                    <span className="bg-white group-open:bg-gray-100 p-2 rounded-full transition-transform group-open:rotate-180">
                                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                    </span>
                                </summary>
                                <div className="px-6 pb-6 text-gray-600 leading-relaxed animate-fadeIn">
                                    After purchase, you&apos;ll receive an email with a secure download link. You can also log in to your dashboard to access your files anytime.
                                </div>
                            </details>

                            <details className="group bg-gray-50 rounded-2xl p-2 cursor-pointer transition-all duration-300 open:bg-white open:shadow-lg open:ring-1 open:ring-gray-200">
                                <summary className="flex items-center justify-between p-4 font-bold text-gray-900 list-none text-lg">
                                    Is this a one-time payment?
                                    <span className="bg-white group-open:bg-gray-100 p-2 rounded-full transition-transform group-open:rotate-180">
                                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                    </span>
                                </summary>
                                <div className="px-6 pb-6 text-gray-600 leading-relaxed animate-fadeIn">
                                    {product.purchaseType === 'subscription'
                                        ? "This is a subscription product. You will be billed according to the subscription storage period."
                                        : "Yes! This is a 100% one-time payment. No hidden fees, no subscriptions. You own the content forever."}
                                </div>
                            </details>

                            {product.moneyBackGuarantee > 0 && (
                                <details className="group bg-gray-50 rounded-2xl p-2 cursor-pointer transition-all duration-300 open:bg-white open:shadow-lg open:ring-1 open:ring-gray-200">
                                    <summary className="flex items-center justify-between p-4 font-bold text-gray-900 list-none text-lg">
                                        What is your refund policy?
                                        <span className="bg-white group-open:bg-gray-100 p-2 rounded-full transition-transform group-open:rotate-180">
                                            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                        </span>
                                    </summary>
                                    <div className="px-6 pb-6 text-gray-600 leading-relaxed animate-fadeIn">
                                        We offer a hassle-free {product.moneyBackGuarantee}-day money-back guarantee. If you&apos;re not completely satisfied, just email us and we&apos;ll refund you.
                                    </div>
                                </details>
                            )}
                        </div>
                    </div>
                </div >
            </section >

            {/* SECTION 6: REVIEWS */}
            < div className="bg-gray-50/50 py-10" >
                <ReviewSection
                    productId={product.id}
                    isPurchaser={!!user?.purchasedProducts?.some(p => (typeof p === 'string' ? p === product.id : p.productId === product.id))}
                />
            </div >

            {/* SECTION 7: FINAL CTA - The Closer */}
            < section className="py-24 bg-primary-900 text-white relative overflow-hidden" >
                <div className="absolute inset-0 bg-[url('/noise.png')] opacity-20 mix-blend-overlay" />
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-transparent to-black/30" />

                <div className="container-page relative z-10 text-center max-w-4xl mx-auto">
                    <h2 className="text-4xl lg:text-6xl font-bold font-display mb-6 tracking-tight text-white">
                        Ready to Level Up?
                    </h2>
                    <p className="text-xl text-primary-100 mb-12 max-w-2xl mx-auto">
                        Join thousands of others who are already using this resource to improved their workflow.
                    </p>

                    <div className="flex flex-col items-center gap-6">
                        {!hasAccess ? (
                            <>
                                <button
                                    className="inline-flex items-center justify-center rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 px-12 py-6 text-2xl font-bold shadow-2xl shadow-primary-500/50 hover:shadow-white/20 hover:scale-105 transition-all bg-white text-primary-900 hover:bg-white hover:opacity-90 ring-4 ring-white/10"
                                    onClick={handleBuyNow}
                                >
                                    Get Instant Access Now
                                </button>
                                <div className="flex items-center gap-6 text-primary-200 text-sm font-medium">
                                    <span className="flex items-center gap-2">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                        One-time payment
                                    </span>
                                    {product.moneyBackGuarantee > 0 && (
                                        <span className="flex items-center gap-2">
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            {product.moneyBackGuarantee}-Day Guarantee
                                        </span>
                                    )}
                                </div>
                            </>
                        ) : (
                            <Link href="/dashboard/downloads" className="inline-flex items-center justify-center font-medium rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 px-12 py-6 text-xl bg-white text-primary-900 hover:bg-gray-100">
                                Go to Dashboard
                            </Link>
                        )}
                    </div>
                </div>
            </section >

            {/* Floating CTA Bar - Keep existing */}
            < div
                className={`fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-gray-200 shadow-[0_-4px_30px_rgba(0,0,0,0.15)] z-[100] transition-transform duration-500 ease-in-out pb-safe ${showFloatingCTA ? "translate-y-0" : "translate-y-full"
                    }`
                }
            >
                <div className="container-page py-3 md:py-4">
                    <div className="flex items-center justify-between gap-3 sm:gap-4">
                        {/* Desktop: Product Info */}
                        <div className="hidden md:flex items-center gap-4">
                            {product.thumbnailURL && (
                                <Image src={product.thumbnailURL} alt="" width={48} height={48} className="rounded-lg object-cover bg-gray-100" />
                            )}
                            <div>
                                <p className="font-bold text-gray-900 line-clamp-1 text-sm sm:text-base">{product.name}</p>
                                <p className="text-xs text-green-600 font-medium">{product.purchaseType === 'subscription' ? 'Subscription' : 'Lifetime Access'}</p>
                            </div>
                        </div>

                        {/* Mobile: Compact Price */}
                        <div className="md:hidden flex flex-col justify-center min-w-[60px]">
                            <p className="font-bold text-gray-900 text-lg leading-none">{formatCurrency(product.price)}</p>
                            {hasDiscount && <p className="text-xs text-gray-500 line-through leading-none mt-0.5">{formatCurrency(product.compareAtPrice!)}</p>}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 flex-1 md:flex-none justify-end min-w-0">
                            {hasAccess ? (
                                <Link href="/dashboard/downloads" className="w-full md:w-auto relative group">
                                    <div className="absolute -inset-0.5 bg-green-500 rounded-lg blur opacity-30 group-hover:opacity-60 transition duration-200 animate-pulse"></div>
                                    <span className="inline-flex items-center justify-center font-medium rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 bg-primary-600 text-white hover:bg-primary-700 w-full md:w-auto px-4 py-2 text-base shadow-lg shadow-primary-500/20 relative">
                                        Access Content
                                    </span>
                                </Link>
                            ) : (
                                <>
                                    <div className="hidden md:block">
                                        <span className="font-bold text-xl text-gray-900 mr-4">{formatCurrency(product.price)}</span>
                                    </div>


                                    <div className="relative flex-1 md:flex-none group">
                                        <div className="absolute -inset-1 bg-primary-500 rounded-xl blur opacity-30 animate-pulse group-hover:opacity-50 transition duration-500"></div>
                                        <Button
                                            variant="primary"
                                            size="lg"
                                            className="w-full md:w-auto px-6 md:px-12 shadow-xl shadow-primary-500/30 font-bold relative overflow-hidden group/btn h-12 md:h-14 rounded-xl"
                                            onClick={handleBuyNow}
                                        >
                                            <div className="absolute inset-x-0 h-full w-20 -skew-x-12 bg-white/20 -translate-x-40 group-hover/btn:animate-[shimmer_2s_infinite] z-10" />
                                            <span className="relative z-20 flex items-center justify-center gap-2 text-sm md:text-base whitespace-nowrap">
                                                <span className="md:hidden">Get Access</span>
                                                <span className="hidden md:inline">Get Instant Access</span>
                                                <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                                </svg>
                                            </span>
                                        </Button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div >
        </div >
    );
}

// Recursive content tree components
function ContentTreeView({ items, depth, theme = "light" }: { items: ContentPreviewItem[]; depth: number; theme?: "light" | "dark" }) {
    return (
        <div className="space-y-0.5">
            {items.map((item) => (
                <ContentTreeItem key={item.id} item={item} depth={depth} theme={theme} />
            ))}
        </div>
    );
}

function ContentTreeItem({ item, depth, theme }: { item: ContentPreviewItem; depth: number; theme: "light" | "dark" }) {
    const isDark = theme === "dark";
    const textColor = isDark ? (depth === 0 ? "text-gray-200" : "text-gray-400") : (depth === 0 ? "text-gray-700" : "text-gray-600");
    const hoverBg = isDark ? "hover:bg-white/10" : "hover:bg-gray-100";
    const iconColor = isDark ? "text-gray-500" : "text-gray-400";
    const folderColor = "text-yellow-500";

    return (
        <div style={{ paddingLeft: depth > 0 ? 16 : 0 }}>
            <div className={`flex items-center gap-2 py-1.5 px-2 rounded-lg transition-colors ${hoverBg}`}>
                {item.type === "folder" ? (
                    <svg className={`w-4 h-4 ${folderColor} flex-shrink-0`} fill="currentColor" viewBox="0 0 20 20">
                        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                    </svg>
                ) : (
                    <svg className={`w-4 h-4 ${iconColor} flex-shrink-0`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                )}
                <span className={`flex-1 text-sm ${depth === 0 ? "font-medium" : ""} ${textColor}`}>
                    {item.name}
                </span>
                <svg className={`w-3 h-3 ${isDark ? "text-gray-600" : "text-gray-300"} flex-shrink-0`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
            </div>
            {item.type === "folder" && item.children && item.children.length > 0 && (
                <div className={`border-l-2 ml-2 ${isDark ? "border-gray-700" : "border-gray-200"}`}>
                    <ContentTreeView items={item.children} depth={depth + 1} theme={theme} />
                </div>
            )}
        </div>
    );
}
