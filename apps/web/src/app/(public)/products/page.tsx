"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@digimine/ui";
import { getProducts } from "@/lib/firestore";
import { type Product } from "@digimine/types";
import { formatCurrency } from "@digimine/utils";

interface ProductsPageProps {
    searchParams: { type?: string; search?: string };
}

export default function ProductsPage({ searchParams }: ProductsPageProps) {
    const { type, search } = searchParams;
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchProducts() {
            setLoading(true);
            try {
                const results = await getProducts({ type });
                // Simple client-side search filtering for now
                const filtered = search
                    ? results.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.description.toLowerCase().includes(search.toLowerCase()))
                    : results;
                setProducts(filtered);
            } catch (error) {
                console.error("Error fetching products:", error);
            } finally {
                setLoading(false);
            }
        }
        fetchProducts();
    }, [type, search]);

    return (
        <div className="bg-gray-50 min-h-screen">
            <div className="container-page py-8">
                {/* Page Header */}
                <div className="mb-8">
                    <h1 className="font-display text-3xl font-bold text-gray-900 mb-2">
                        {type ? `${type.charAt(0).toUpperCase() + type.slice(1)}s` : "All Products"}
                    </h1>
                    <p className="text-gray-600">
                        {search
                            ? `Search results for "${search}"`
                            : "Discover premium digital products from creators worldwide"}
                    </p>
                </div>

                <div className="flex flex-col lg:flex-row gap-8">
                    {/* Filters Sidebar */}
                    <aside className="w-full lg:w-64 flex-shrink-0">
                        <Card padding="lg">
                            <h3 className="font-semibold text-gray-900 mb-4">Categories</h3>
                            <ul className="space-y-2">
                                <li>
                                    <Link
                                        href="/products"
                                        className={`block px-3 py-2 rounded-lg transition-colors ${!type
                                            ? "bg-primary-50 text-primary-700"
                                            : "text-gray-600 hover:bg-gray-50"
                                            }`}
                                    >
                                        All Products
                                    </Link>
                                </li>
                                <li>
                                    <Link
                                        href="/products?type=ebook"
                                        className={`block px-3 py-2 rounded-lg transition-colors ${type === "ebook"
                                            ? "bg-primary-50 text-primary-700"
                                            : "text-gray-600 hover:bg-gray-50"
                                            }`}
                                    >
                                        eBooks
                                    </Link>
                                </li>
                                <li>
                                    <Link
                                        href="/products?type=course"
                                        className={`block px-3 py-2 rounded-lg transition-colors ${type === "course"
                                            ? "bg-primary-50 text-primary-700"
                                            : "text-gray-600 hover:bg-gray-50"
                                            }`}
                                    >
                                        Courses
                                    </Link>
                                </li>
                                <li>
                                    <Link
                                        href="/products?type=template"
                                        className={`block px-3 py-2 rounded-lg transition-colors ${type === "template"
                                            ? "bg-primary-50 text-primary-700"
                                            : "text-gray-600 hover:bg-gray-50"
                                            }`}
                                    >
                                        Templates
                                    </Link>
                                </li>
                                <li>
                                    <Link
                                        href="/products?type=software"
                                        className={`block px-3 py-2 rounded-lg transition-colors ${type === "software"
                                            ? "bg-primary-50 text-primary-700"
                                            : "text-gray-600 hover:bg-gray-50"
                                            }`}
                                    >
                                        Software
                                    </Link>
                                </li>
                            </ul>
                        </Card>
                    </aside>

                    {/* Products Grid */}
                    <div className="flex-1">
                        {/* Search Bar */}
                        <form className="mb-6" onSubmit={(e) => {
                            e.preventDefault();
                            const query = (e.currentTarget.elements.namedItem("search") as HTMLInputElement).value;
                            const params = new URLSearchParams();
                            if (type) params.set("type", type);
                            if (query) params.set("search", query);
                            window.location.href = `/products?${params.toString()}`;
                        }}>
                            <div className="relative">
                                <input
                                    type="text"
                                    name="search"
                                    placeholder="Search products..."
                                    defaultValue={search}
                                    className="w-full px-4 py-3 pl-12 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all outline-none"
                                />
                                <svg
                                    className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                                    />
                                </svg>
                            </div>
                        </form>

                        {/* Products Grid */}
                        {loading ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                                {[1, 2, 3, 4, 5, 6].map((i) => (
                                    <Card key={i} hoverable padding="none" className="overflow-hidden">
                                        <div className="aspect-video bg-gray-200 animate-pulse" />
                                        <div className="p-4">
                                            <div className="h-4 bg-gray-200 rounded animate-pulse mb-2" />
                                            <div className="h-3 bg-gray-100 rounded animate-pulse w-2/3 mb-3" />
                                            <div className="h-5 bg-gray-200 rounded animate-pulse w-1/3" />
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        ) : products.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                                {products.map((product) => (
                                    <Link href={`/products/${product.slug}`} key={product.id}>
                                        <Card hoverable padding="none" className="overflow-hidden h-full flex flex-col">
                                            <div className="aspect-video bg-gray-100 relative overflow-hidden">
                                                {product.thumbnailURL ? (
                                                    <img
                                                        src={product.thumbnailURL}
                                                        alt={product.name}
                                                        className="w-full h-full object-cover px-1"
                                                    />
                                                ) : (
                                                    <div className="absolute inset-0 flex items-center justify-center text-gray-300">
                                                        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                        </svg>
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
                                                <div className="font-bold text-gray-900">
                                                    {formatCurrency(product.price)}
                                                </div>
                                            </div>
                                        </Card>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-20 px-4 bg-white rounded-2xl border border-dashed border-gray-200">
                                <p className="text-gray-500 font-medium">No products found matching your criteria.</p>
                                <Link href="/products" className="text-primary-600 hover:underline mt-2 inline-block">
                                    Clear all filters
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
