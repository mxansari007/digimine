"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { getProducts } from "@/lib/firestore";
import { type Product } from "@digimine/types";
import { formatCurrency } from "@digimine/utils";

export default function HomePage() {
    const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchFeatured() {
            try {
                const products = await getProducts({ limitCount: 4 });
                setFeaturedProducts(products);
            } catch (error) {
                console.error("Error fetching featured products:", error);
            } finally {
                setLoading(false);
            }
        }
        fetchFeatured();
    }, []);

    return (
        <>
            {/* Hero Section */}
            <section className="bg-gradient-to-br from-primary-50 via-white to-accent-50 py-20">
                <div className="container-page">
                    <div className="text-center max-w-4xl mx-auto">
                        <h1 className="font-display text-5xl md:text-6xl font-bold text-gray-900 mb-6">
                            Discover Premium{" "}
                            <span className="bg-gradient-to-r from-primary-600 to-accent-600 bg-clip-text text-transparent">
                                Digital Products
                            </span>
                        </h1>
                        <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
                            eBooks, courses, templates, and more from creators worldwide.
                            Start learning and creating today.
                        </p>
                        <div className="flex flex-col sm:flex-row justify-center gap-4">
                            <Link href="/products">
                                <Button variant="primary" size="lg">
                                    Browse Products
                                </Button>
                            </Link>
                            <Link href="/register">
                                <Button variant="outline" size="lg">
                                    Become a Creator
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* Categories Section */}
            <section className="py-16 bg-white">
                <div className="container-page">
                    <div className="text-center mb-12">
                        <h2 className="font-display text-3xl font-bold text-gray-900 mb-4">
                            Explore Categories
                        </h2>
                        <p className="text-gray-600 max-w-xl mx-auto">
                            Find the perfect digital products to level up your skills
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Link href="/products?type=ebook">
                            <Card hoverable padding="lg" className="h-full">
                                <div className="text-center">
                                    <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                        <svg
                                            className="w-8 h-8 text-primary-600"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                                            />
                                        </svg>
                                    </div>
                                    <h3 className="font-display text-xl font-semibold text-gray-900 mb-2">
                                        eBooks
                                    </h3>
                                    <p className="text-gray-600">
                                        In-depth guides and knowledge from industry experts.
                                    </p>
                                </div>
                            </Card>
                        </Link>

                        <Link href="/products?type=course">
                            <Card hoverable padding="lg" className="h-full">
                                <div className="text-center">
                                    <div className="w-16 h-16 bg-accent-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                        <svg
                                            className="w-8 h-8 text-accent-600"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                                            />
                                        </svg>
                                    </div>
                                    <h3 className="font-display text-xl font-semibold text-gray-900 mb-2">
                                        Courses
                                    </h3>
                                    <p className="text-gray-600">
                                        Video tutorials and structured learning paths.
                                    </p>
                                </div>
                            </Card>
                        </Link>

                        <Link href="/products?type=template">
                            <Card hoverable padding="lg" className="h-full">
                                <div className="text-center">
                                    <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                        <svg
                                            className="w-8 h-8 text-primary-600"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
                                            />
                                        </svg>
                                    </div>
                                    <h3 className="font-display text-xl font-semibold text-gray-900 mb-2">
                                        Templates
                                    </h3>
                                    <p className="text-gray-600">
                                        Ready-to-use designs and starter kits.
                                    </p>
                                </div>
                            </Card>
                        </Link>
                    </div>
                </div>
            </section>

            {/* Featured Products */}
            <section className="py-16 bg-gray-50">
                <div className="container-page">
                    <div className="flex items-center justify-between mb-8">
                        <h2 className="font-display text-2xl font-bold text-gray-900">
                            Featured Products
                        </h2>
                        <Link
                            href="/products"
                            className="text-primary-600 hover:text-primary-700 font-medium"
                        >
                            View All →
                        </Link>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                        {loading ? (
                            [1, 2, 3, 4].map((i) => (
                                <Card key={i} hoverable padding="none" className="overflow-hidden">
                                    <div className="aspect-video bg-gray-200 animate-pulse" />
                                    <div className="p-4">
                                        <div className="h-4 bg-gray-200 rounded animate-pulse mb-2" />
                                        <div className="h-3 bg-gray-100 rounded animate-pulse w-2/3 mb-3" />
                                        <div className="h-5 bg-gray-200 rounded animate-pulse w-1/3" />
                                    </div>
                                </Card>
                            ))
                        ) : featuredProducts.length > 0 ? (
                            featuredProducts.map((product) => {
                                const hasDiscount = product.compareAtPrice && product.compareAtPrice > product.price;
                                const savingsPercent = hasDiscount
                                    ? Math.round(((product.compareAtPrice! - product.price) / product.compareAtPrice!) * 100)
                                    : 0;

                                return (
                                    <Link href={`/products/${product.slug}`} key={product.id}>
                                        <Card hoverable padding="none" className="overflow-hidden h-full flex flex-col group">
                                            <div className="aspect-video bg-gray-100 relative overflow-hidden">
                                                {product.thumbnailURL ? (
                                                    <img
                                                        src={product.thumbnailURL}
                                                        alt={product.name}
                                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                    />
                                                ) : (
                                                    <div className="absolute inset-0 flex items-center justify-center text-gray-300">
                                                        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                        </svg>
                                                    </div>
                                                )}
                                                {/* Savings Badge */}
                                                {hasDiscount && (
                                                    <div className="absolute top-2 left-2 bg-red-500 text-white px-2 py-0.5 rounded-full text-xs font-bold">
                                                        -{savingsPercent}%
                                                    </div>
                                                )}
                                                {/* Instant Access Badge */}
                                                {product.instantAccess && (
                                                    <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1">
                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                        </svg>
                                                        Instant
                                                    </div>
                                                )}
                                            </div>
                                            <div className="p-4 flex-1 flex flex-col">
                                                <span className="text-xs font-medium text-primary-600 bg-primary-50 px-2 py-1 rounded-full w-fit mb-2">
                                                    {product.type.toUpperCase()}
                                                </span>
                                                <h3 className="font-semibold text-gray-900 line-clamp-1 mb-1">
                                                    {product.name}
                                                </h3>
                                                <p className="text-sm text-gray-500 line-clamp-2 mb-4 flex-1">
                                                    {product.shortDescription || "No description available."}
                                                </p>
                                                <div className="flex items-baseline gap-2">
                                                    <span className="font-bold text-gray-900">
                                                        {formatCurrency(product.price)}
                                                    </span>
                                                    {hasDiscount && (
                                                        <span className="text-sm text-gray-400 line-through">
                                                            {formatCurrency(product.compareAtPrice!)}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </Card>
                                    </Link>
                                );
                            })
                        ) : (
                            <p className="col-span-full text-center text-gray-500 py-12">
                                No products found. Products will appear here once added from the admin dashboard.
                            </p>
                        )}
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-20 bg-gradient-to-r from-primary-600 to-accent-600">
                <div className="container-page text-center">
                    <h2 className="font-display text-3xl md:text-4xl font-bold text-white mb-4">
                        Ready to Start Learning?
                    </h2>
                    <p className="text-primary-100 text-lg mb-8 max-w-xl mx-auto">
                        Join thousands of learners and creators on Digimine. Sign up for
                        free and start exploring.
                    </p>
                    <Link href="/register">
                        <Button
                            variant="secondary"
                            size="lg"
                            className="bg-white text-primary-600 hover:bg-gray-100"
                        >
                            Create Free Account
                        </Button>
                    </Link>
                </div>
            </section>
        </>
    );
}
