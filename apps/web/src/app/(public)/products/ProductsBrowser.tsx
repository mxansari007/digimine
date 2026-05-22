"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { ProductCard } from "@/components/products/ProductCard";
import { getAllReviewStats } from "@/lib/firestore";
import { trackSearch } from "@/lib/fpixel";
import type { Product, ProductType } from "@digimine/types";
import { useAuthContext } from "@/contexts/AuthContext";
import { FilterSidebar, type ProductFilters } from "@/components/products/FilterSidebar";
import { FilterDrawer } from "@/components/products/FilterDrawer";
import type { StoreCardItem } from "@/lib/server/catalog";

/**
 * Client-side filters / search / per-user badges for the store, seeded with
 * `items` fetched on the server. The SSR HTML already lists every product +
 * test-series card and link (crawlable); ownership badges and review stats
 * (personalized, non-SEO) hydrate in the browser.
 */
export default function ProductsBrowser({
    items,
    initialType,
    initialSearch,
}: {
    items: StoreCardItem[];
    initialType?: string;
    initialSearch?: string;
}) {
    const { user } = useAuthContext();
    const [reviewStats, setReviewStats] = useState<Map<string, { averageRating: number; reviewCount: number }>>(new Map());
    const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
    const [filters, setFilters] = useState<ProductFilters>({
        categories: initialType ? [initialType as ProductType] : [],
        purchaseType: "all",
        priceRange: { min: 0, max: null },
    });

    useEffect(() => {
        getAllReviewStats()
            .then(setReviewStats)
            .catch((error) => console.error("Error loading review stats:", error));
    }, []);

    const displayedProducts = useMemo(() => {
        let filtered = items;
        const search = (initialSearch || "").toLowerCase().trim();
        if (search) {
            filtered = filtered.filter(
                (p) => p.name.toLowerCase().includes(search) || p.description.toLowerCase().includes(search)
            );
        }
        if (filters.categories.length > 0) {
            filtered = filtered.filter((p) => filters.categories.includes(p.type as ProductType));
        }
        if (filters.purchaseType !== "all") {
            filtered = filtered.filter((p) => p.purchaseType === filters.purchaseType);
        }
        return filtered;
    }, [items, filters, initialSearch]);

    useEffect(() => {
        if (initialSearch) trackSearch(initialSearch, displayedProducts.length);
    }, [initialSearch, displayedProducts.length]);

    return (
        <>
            <div className="flex flex-col gap-8 lg:flex-row">
                <aside className="hidden w-64 flex-shrink-0 lg:block">
                    <Card padding="lg">
                        <FilterSidebar onFilterChange={setFilters} initialFilters={filters} />
                    </Card>
                </aside>

                <div className="flex-1">
                    <form
                        className="sticky top-20 z-10 mb-6 lg:static lg:z-0"
                        onSubmit={(e) => {
                            e.preventDefault();
                            const query = (e.currentTarget.elements.namedItem("search") as HTMLInputElement).value;
                            const params = new URLSearchParams();
                            if (initialType) params.set("type", initialType);
                            if (query) params.set("search", query);
                            window.location.href = `/products?${params.toString()}`;
                        }}
                    >
                        <div className="relative">
                            <input
                                type="text"
                                name="search"
                                placeholder="Search topics, notes, study material, tests, or articles..."
                                defaultValue={initialSearch}
                                aria-label="Search products"
                                className="w-full rounded-xl border border-gray-200 px-4 py-3 pl-12 outline-none transition-all focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                            />
                            <svg className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                    </form>

                    {displayedProducts.length > 0 ? (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-3">
                            {displayedProducts.map((item) => {
                                const purchases = user?.purchasedProducts || [];
                                const isOwned =
                                    purchases.some((p: unknown) => (typeof p === "string" ? p === item.id : (p as { productId?: string }).productId === item.id)) &&
                                    item.purchaseType !== "subscription";
                                const isSubscribed =
                                    purchases.some((p: unknown) => {
                                        if (typeof p === "string") return false;
                                        const rec = p as { productId?: string; expiresAt?: string | null };
                                        return rec.productId === item.id && (rec.expiresAt == null || new Date(rec.expiresAt) > new Date());
                                    }) && item.purchaseType === "subscription";

                                return (
                                    <ProductCard
                                        key={item.id}
                                        product={item as unknown as Product}
                                        rating={reviewStats.get(item.id)?.averageRating}
                                        reviewCount={reviewStats.get(item.id)?.reviewCount}
                                        isOwned={isOwned}
                                        isSubscribed={isSubscribed}
                                    />
                                );
                            })}
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-20 text-center">
                            <p className="font-medium text-gray-500">No products found matching your criteria.</p>
                            <Link href="/products" className="mt-2 inline-block text-primary-600 hover:underline">
                                Clear all filters
                            </Link>
                        </div>
                    )}
                </div>
            </div>

            <div className="fixed bottom-6 right-6 z-40 lg:hidden">
                <Button
                    className="flex items-center gap-2 rounded-full bg-gray-900 px-6 py-3 text-white shadow-xl hover:bg-gray-800"
                    onClick={() => setIsFilterDrawerOpen(true)}
                >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                    </svg>
                    Filters
                    {(filters.categories.length > 0 || filters.purchaseType !== "all") && (
                        <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-400 opacity-75"></span>
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-500"></span>
                        </span>
                    )}
                </Button>
            </div>

            <FilterDrawer
                isOpen={isFilterDrawerOpen}
                onClose={() => setIsFilterDrawerOpen(false)}
                onFilterChange={setFilters}
                initialFilters={filters}
            />
        </>
    );
}
