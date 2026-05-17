"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button, Card } from "@digimine/ui";
import { ProductCard } from "@/components/products/ProductCard";
import { getProducts, getAllReviewStats } from "@/lib/firestore";
import { type Product } from "@digimine/types";


export default function HomePage() {
    const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [reviewStats, setReviewStats] = useState<Map<string, { averageRating: number; reviewCount: number }>>(new Map());

    useEffect(() => {
        async function fetchFeatured() {
            try {
                const [products, stats, testSeries] = await Promise.all([
                    getProducts({ limitCount: 4 }),
                    getAllReviewStats(),
                    import("@/lib/firestore/tests").then(m => m.getPublishedTestSeries())
                ]);
                
                // Merge one test series into featured if available
                const mergedProducts = [...products];
                if (testSeries.length > 0) {
                    const ts = testSeries[0];
                    mergedProducts.push({
                        id: ts.id,
                        name: ts.title,
                        slug: ts.slug,
                        description: ts.description,
                        shortDescription: ts.shortDescription || ts.description.slice(0, 100),
                        price: ts.price,
                        compareAtPrice: ts.compareAtPrice,
                        type: "test_series",
                        purchaseType: "downloadable",
                        status: ts.status as any,
                        thumbnailURL: ts.thumbnailURL,
                        images: ts.thumbnailURL ? [ts.thumbnailURL] : [],
                        files: [],
                        contentPreview: [],
                        tags: ts.tags,
                        highlights: ts.highlights,
                        deliveryFormat: "online",
                        moneyBackGuarantee: 0,
                        instantAccess: true,
                        createdAt: ts.createdAt,
                        updatedAt: ts.updatedAt,
                        createdBy: ts.createdBy
                    });
                }

                setFeaturedProducts(mergedProducts.slice(0, 4));
                setReviewStats(stats);
            } catch (error) {
                console.error("Error fetching featured products:", error);
            } finally {
                setLoading(false);
            }
        }
        fetchFeatured();
    }, []);

    return (
        <div className="bg-white">
            {/* Hero Section */}
            <section className="relative overflow-hidden bg-gray-900 py-16 lg:py-48">
                {/* Dynamic Background */}
                <div className="absolute inset-0 z-0">
                    <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-900 to-primary-900/50" />
                    <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary-500/30 rounded-full blur-3xl animate-pulse" />
                    <div className="absolute bottom-0 left-0 w-72 h-72 bg-accent-500/20 rounded-full blur-3xl" />
                </div>

                <div className="container-page relative z-10">
                    <div className="max-w-4xl mx-auto text-center space-y-8">
                        {/* Badge */}
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 text-primary-200 text-sm font-medium border border-white/10 backdrop-blur-sm mb-4">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-500"></span>
                            </span>
                            Premium Digital Resources
                        </div>

                        <h1 className="font-display text-4xl sm:text-5xl md:text-7xl font-bold text-white tracking-tight" style={{ lineHeight: '1.1' }}>
                            Master Your <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-400 via-primary-200 to-accent-300">
                                Creative Craft
                            </span>
                        </h1>

                        <p className="text-base sm:text-lg md:text-xl text-gray-300 max-w-2xl mx-auto" style={{ lineHeight: '1.6' }}>
                            Discover high-quality eBooks, courses, and templates to accelerate your career.
                            <span className="text-white font-medium"> Instant access. Lifetime value.</span>
                        </p>

                        <div className="flex flex-col sm:flex-row justify-center gap-4 pt-4">
                            <Link href="/products">
                                <Button
                                    className="!bg-primary-600 !text-white hover:!bg-primary-500 hover:scale-105 transition-all duration-300 text-lg px-8 py-4 shadow-xl shadow-primary-500/25 border-none"
                                >
                                    Explore Products
                                </Button>
                            </Link>
                        </div>

                        {/* Social Proof */}
                        <div className="pt-12 flex flex-col items-center gap-4 text-sm text-gray-400">
                            <p>Join 10,000+ happy students & professionals</p>
                            <div className="flex -space-x-3">
                                {[
                                    "https://randomuser.me/api/portraits/men/32.jpg",
                                    "https://randomuser.me/api/portraits/women/44.jpg",
                                    "https://randomuser.me/api/portraits/men/86.jpg",
                                    "https://randomuser.me/api/portraits/women/68.jpg",
                                    "https://randomuser.me/api/portraits/men/46.jpg"
                                ].map((src, i) => (
                                    <Image
                                        key={i}
                                        src={src}
                                        alt={`User ${i + 1}`}
                                        width={40}
                                        height={40}
                                        unoptimized
                                        className="rounded-full border-2 border-gray-900 object-cover bg-gray-800"
                                    />
                                ))}
                                <div className="w-10 h-10 rounded-full border-2 border-gray-900 bg-gray-800 flex items-center justify-center text-xs font-bold text-white bg-gradient-to-br from-primary-600 to-accent-600 relative z-10">
                                    +1k
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Categories Section - "Bento" Style Grid */}
            <section className="py-16 lg:py-24 bg-gray-50">
                <div className="container-page">
                    <div className="text-center mb-16">
                        <span className="section-eyebrow">Categories</span>
                        <h2 className="font-display text-2xl md:text-4xl font-bold text-slate-900 mb-3 md:mb-4 tracking-tight">
                            Everything You Need to Scale
                        </h2>
                        <p className="text-base md:text-lg text-slate-500 max-w-2xl mx-auto leading-relaxed">
                            Hand-picked categories to help you learn faster and build better.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {/* Ebooks */}
                        <Link href="/products?type=ebook" className="group">
                            <div className="h-full bg-white rounded-3xl p-8 border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 ease-out will-change-transform relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110 duration-500">
                                    <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2l5 5h-5V4z" /></svg>
                                </div>
                                <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-blue-500/20 group-hover:rotate-6 transition-transform">
                                    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                                </div>
                                <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-2 md:mb-3 group-hover:text-blue-600 transition-colors">eBooks & Guides</h3>
                                <p className="text-sm md:text-base text-gray-500">Expert knowledge distilled into actionable guides. Learn at your own pace.</p>
                            </div>
                        </Link>

                        {/* Courses */}
                        <Link href="/products?type=course" className="group">
                            <div className="h-full bg-white rounded-3xl p-8 border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 ease-out will-change-transform relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110 duration-500">
                                    <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" /></svg>
                                </div>
                                <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-purple-500/20 group-hover:-rotate-6 transition-transform">
                                    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                </div>
                                <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-2 md:mb-3 group-hover:text-purple-600 transition-colors">Video Courses</h3>
                                <p className="text-sm md:text-base text-gray-500">Structured learning paths with high-quality video content from pros.</p>
                            </div>
                        </Link>

                        {/* Templates */}
                        <Link href="/products?type=template" className="group">
                            <div className="h-full bg-white rounded-3xl p-8 border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 ease-out will-change-transform relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110 duration-500">
                                    <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24"><path d="M3 3v18h18V3H3zm16 16H5V5h14v14zM7 7h10v2H7V7zm0 4h10v2H7v-2zm0 4h7v2H7v-2z" /></svg>
                                </div>
                                <div className="w-14 h-14 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/20 group-hover:rotate-6 transition-transform">
                                    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
                                </div>
                                <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-2 md:mb-3 group-hover:text-emerald-600 transition-colors">Templates & Assets</h3>
                                <p className="text-sm md:text-base text-gray-500">Save time with ready-to-use Notion templates, UI kits, and spreadsheets.</p>
                            </div>
                        </Link>

                        {/* Test Series */}
                        <Link href="/tests" className="group">
                            <div className="h-full bg-white rounded-3xl p-8 border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 ease-out will-change-transform relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110 duration-500">
                                    <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24"><path d="M4 6h16v12H4zM2 4v16h20V4H2zm11 9h4v2h-4v-2zm-4-3h8v2H9v-2zm0 6h4v2H9v-2z"/></svg>
                                </div>
                                <div className="w-14 h-14 bg-gradient-to-br from-orange-400 to-red-500 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-orange-500/20 group-hover:rotate-6 transition-transform">
                                    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                                </div>
                                <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-2 md:mb-3 group-hover:text-orange-600 transition-colors">Test Series</h3>
                                <p className="text-sm md:text-base text-gray-500">Practice with timed mock tests and get detailed analytics on your performance.</p>
                            </div>
                        </Link>
                    </div>
                </div>
            </section>

            {/* Featured Products with Modern Cards */}
            <section className="py-16 lg:py-24 bg-white">
                <div className="container-page">
                    <div className="flex items-end justify-between mb-12">
                        <div>
                            <span className="section-eyebrow text-xs md:text-sm">Premium Selection</span>
                            <h2 className="font-display text-2xl md:text-4xl font-bold text-slate-900 tracking-tight">
                                Trending Products
                            </h2>
                        </div>
                        <Link
                            href="/products"
                            className="hidden sm:flex items-center gap-2 text-gray-600 hover:text-primary-600 font-medium transition-colors group"
                        >
                            View Entire Catalog
                            <span className="group-hover:translate-x-1 transition-transform">→</span>
                        </Link>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-8">
                        {loading ? (
                            [1, 2, 3, 4].map((i) => (
                                <Card key={i} hoverable padding="none" className="overflow-hidden border-0 shadow-lg">
                                    <div className="aspect-[4/3] bg-gray-100 animate-pulse" />
                                    <div className="p-6">
                                        <div className="h-4 bg-gray-200 rounded w-1/3 mb-4" />
                                        <div className="h-6 bg-gray-200 rounded w-3/4 mb-3" />
                                        <div className="h-4 bg-gray-100 rounded w-full mb-6" />
                                        <div className="flex justify-between mt-auto">
                                            <div className="h-6 w-20 bg-gray-200 rounded" />
                                        </div>
                                    </div>
                                </Card>
                            ))
                        ) : featuredProducts.length > 0 ? (
                            featuredProducts.map((product) => (
                                <ProductCard
                                    key={product.id}
                                    product={product}
                                    rating={reviewStats.get(product.id)?.averageRating}
                                    reviewCount={reviewStats.get(product.id)?.reviewCount}
                                />
                            ))
                        ) : (
                            <div className="col-span-full py-16 text-center bg-gray-50 rounded-3xl border border-dashed border-gray-300">
                                <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                                <p className="text-gray-500 text-lg">New products arriving soon.</p>
                            </div>
                        )}
                    </div>

                    <div className="mt-8 text-center sm:hidden">
                        <Link href="/products">
                            <Button className="w-full bg-primary-600 text-white font-medium py-4 rounded-xl shadow-lg shadow-primary-500/20 active:scale-95 transition-all">
                                View All Products
                            </Button>
                        </Link>
                    </div>
                </div>
            </section>

            {/* Newsletter / CTA Section */}
            <section className="relative py-16 lg:py-24 bg-gray-900 overflow-hidden isolate">
                {/* Background Effects */}
                <svg
                    viewBox="0 0 1024 1024"
                    className="absolute left-1/2 top-1/2 -z-10 h-[64rem] w-[64rem] -translate-y-1/2 [mask-image:radial-gradient(closest-side,white,transparent)] sm:left-full sm:-ml-80 lg:left-1/2 lg:ml-0 lg:-translate-x-1/2 lg:translate-y-0"
                    aria-hidden="true"
                >
                    <circle cx="512" cy="512" r="512" fill="url(#gradient)" fillOpacity="0.7" />
                    <defs>
                        <radialGradient id="gradient">
                            <stop stopColor="#4F46E5" />
                            <stop offset="1" stopColor="#80bfff" />
                        </radialGradient>
                    </defs>
                </svg>

                <div className="container-page text-center relative z-10">
                    <h2 className="font-display text-3xl md:text-5xl font-bold text-white mb-4 md:mb-6 tracking-tight" style={{ lineHeight: '1.1' }}>
                        Ready to Level Up?
                    </h2>
                    <p className="text-base md:text-lg text-gray-300 mb-8 md:mb-10 max-w-2xl mx-auto leading-relaxed">
                        Join 10,000+ others accelerating their growth. Get instant access to the tools you need to succeed.
                    </p>
                    <div className="flex flex-col sm:flex-row justify-center gap-4">
                        <Link href="/products">
                            <span
                                className="inline-flex items-center justify-center font-medium rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 bg-primary-500 hover:bg-primary-400 text-white text-lg px-8 py-4 shadow-lg shadow-primary-500/30"
                            >
                                Browse All Products
                            </span>
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
}
