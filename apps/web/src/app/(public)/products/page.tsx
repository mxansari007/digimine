"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { ProductCard } from "@/components/products/ProductCard";
import { getProducts, getAllReviewStats } from "@/lib/firestore";
import { trackSearch } from "@/lib/fpixel";
import { type Product, type ProductType } from "@digimine/types";

import { useAuthContext } from "@/contexts/AuthContext";
import { FilterSidebar, type ProductFilters } from "@/components/products/FilterSidebar";
import { FilterDrawer } from "@/components/products/FilterDrawer";

interface ProductsPageProps {
    searchParams: { type?: string; search?: string };
}

export default function ProductsPage({ searchParams }: ProductsPageProps) {
    const { type, search } = searchParams;
    const { user } = useAuthContext();
    const [allProducts, setAllProducts] = useState<Product[]>([]); // Store all fetched
    const [displayedProducts, setDisplayedProducts] = useState<Product[]>([]); // Store filtered
    const [loading, setLoading] = useState(true);
    const [reviewStats, setReviewStats] = useState<Map<string, { averageRating: number; reviewCount: number }>>(new Map());
    const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);

    // Initialize filters from URL if present
    const [filters, setFilters] = useState<ProductFilters>({
        categories: type ? [type as ProductType] : [],
        purchaseType: "all",
        priceRange: { min: 0, max: null }
    });

    // Fetch Initial Data
    useEffect(() => {
        async function fetchProducts() {
            setLoading(true);
            try {
                // Fetch ALL published products initially to allow client-side filtering
                // This is efficient enough for catalog size < 1000 items
                const [results, stats] = await Promise.all([
                    getProducts(),
                    getAllReviewStats()
                ]);

                setAllProducts(results);
                setReviewStats(stats);
            } catch (error) {
                console.error("Error fetching products:", error);
            } finally {
                setLoading(false);
            }
        }
        fetchProducts();
    }, []); // Only fetch once on mount

    // Apply Filters whenever filters or search changes
    useEffect(() => {
        if (loading) return;

        let filtered = [...allProducts];

        // 1. Search Filter
        if (search) {
            const query = search.toLowerCase();
            filtered = filtered.filter(p =>
                p.name.toLowerCase().includes(query) ||
                p.description.toLowerCase().includes(query)
            );
        }

        // 2. Category Filter (Sidebar)
        // If filters selected, match ANY of them. If none, match all (unless URL type was set initially but we treat that as filter state now)
        if (filters.categories.length > 0) {
            filtered = filtered.filter(p => filters.categories.includes(p.type));
        }

        // 3. Purchase Type Filter
        if (filters.purchaseType !== "all") {
            filtered = filtered.filter(p => p.purchaseType === filters.purchaseType);
        }

        setDisplayedProducts(filtered);
    }, [allProducts, filters, search, loading]);

    // Fire Meta Pixel Search event when a search query is active
    useEffect(() => {
        if (!loading && search) {
            trackSearch(search, displayedProducts.length);
        }
    }, [search, displayedProducts.length, loading]);

    const handleFilterChange = (newFilters: ProductFilters) => {
        setFilters(newFilters);
        // Optionally update URL to reflect state (omitted for now to keep simple)
    };

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
                    {/* Filters Sidebar - Desktop Only */}
                    <aside className="hidden lg:block w-64 flex-shrink-0">
                        <Card padding="lg">
                            <FilterSidebar
                                onFilterChange={handleFilterChange}
                                initialFilters={filters}
                            />
                        </Card>
                    </aside>

                    {/* Products Grid */}
                    <div className="flex-1">
                        {/* Search Bar - Hidden on mobile if needed, or simplified */}
                        <form className="mb-6 sticky top-20 z-10 lg:static lg:z-0" onSubmit={(e) => {
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
                            <div className="grid grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-6">
                                {[1, 2, 3, 4, 5, 6].map((i) => (
                                    <Card key={i} hoverable padding="none" className="overflow-hidden border-0 shadow-sm">
                                        <div className="aspect-[4/3] bg-gray-100 animate-pulse" />
                                        <div className="p-4">
                                            <div className="h-4 bg-gray-200 rounded animate-pulse mb-2" />
                                            <div className="h-3 bg-gray-100 rounded animate-pulse w-2/3 mb-3" />
                                            <div className="h-5 bg-gray-200 rounded animate-pulse w-1/3" />
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        ) : displayedProducts.length > 0 ? (
                            <div className="grid grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-6">
                                {displayedProducts.map((product) => {
                                    const purchases = user?.purchasedProducts || [];
                                    const isOwned = purchases.some((p: any) => {
                                        if (typeof p === 'string') return p === product.id;
                                        return p.productId === product.id;
                                    }) && product.purchaseType !== 'subscription';

                                    const isSubscribed = purchases.some((p: any) => {
                                        if (typeof p === 'string') return false;
                                        return p.productId === product.id && (p.expiresAt === null || new Date(p.expiresAt) > new Date());
                                    }) && product.purchaseType === 'subscription';

                                    return (
                                        <ProductCard
                                            key={product.id}
                                            product={product}
                                            rating={reviewStats.get(product.id)?.averageRating}
                                            reviewCount={reviewStats.get(product.id)?.reviewCount}
                                            isOwned={isOwned}
                                            isSubscribed={isSubscribed}
                                        />
                                    );
                                })}
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

            {/* Mobile Filter Button */}
            <div className="fixed bottom-6 right-6 z-40 lg:hidden">
                <Button
                    className="shadow-xl bg-gray-900 text-white rounded-full px-6 py-3 flex items-center gap-2 hover:bg-gray-800"
                    onClick={() => setIsFilterDrawerOpen(true)}
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                    </svg>
                    Filters
                    {(filters.categories.length > 0 || filters.purchaseType !== "all") && (
                        <span className="flex h-2 w-2 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-500"></span>
                        </span>
                    )}
                </Button>
            </div>

            {/* Mobile Filter Drawer */}
            <FilterDrawer
                isOpen={isFilterDrawerOpen}
                onClose={() => setIsFilterDrawerOpen(false)}
                onFilterChange={handleFilterChange}
                initialFilters={filters}
            />
        </div>
    );
}
