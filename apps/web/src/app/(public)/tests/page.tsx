"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { getPublishedTests } from "@/lib/firestore/tests";
import { BookOpenIcon, CheckIcon, FileTextIcon, FlaskIcon } from "@/components/icons/AppIcons";
import type { TestSeries } from "@digimine/types";

type SortOption = "newest" | "price-low" | "price-high" | "questions";

export default function TestsPage() {
    const [tests, setTests] = useState<TestSeries[]>([]);
    const [loading, setLoading] = useState(true);
    const [categoryFilter, setCategoryFilter] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState<SortOption>("newest");
    const [accessFilter, setAccessFilter] = useState<"all" | "free" | "paid">("all");

    useEffect(() => {
        loadTests();
    }, [categoryFilter]);

    async function loadTests() {
        try {
            setLoading(true);
            const filters: { category?: string } = {};
            if (categoryFilter) {
                filters.category = categoryFilter;
            }
            const data = await getPublishedTests(filters);
            setTests(data);
        } catch (error) {
            console.error("Error loading tests:", error);
        } finally {
            setLoading(false);
        }
    }

    // Get unique categories
    const categories = [...new Set(tests.map((t) => t.category).filter((category): category is string => Boolean(category)))];

    // Apply search, access type, and sort filters in-memory
    const visibleTests = (() => {
        const q = searchQuery.trim().toLowerCase();
        let list = tests.filter((t) => {
            const matchesSearch = !q
                || t.title.toLowerCase().includes(q)
                || (t.shortDescription || "").toLowerCase().includes(q)
                || (t.tags || []).some((tag) => tag.toLowerCase().includes(q));
            const matchesAccess = accessFilter === "all" || t.accessType === accessFilter;
            return matchesSearch && matchesAccess;
        });
        switch (sortBy) {
            case "price-low":
                list = [...list].sort((a, b) => (a.price || 0) - (b.price || 0));
                break;
            case "price-high":
                list = [...list].sort((a, b) => (b.price || 0) - (a.price || 0));
                break;
            case "questions":
                list = [...list].sort((a, b) => (b.totalQuestions || 0) - (a.totalQuestions || 0));
                break;
            case "newest":
            default:
                list = [...list].sort((a, b) => {
                    const aT = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
                    const bT = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
                    return bT - aT;
                });
        }
        return list;
    })();

    return (
        <div className="min-h-screen bg-gray-50 py-12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Header */}
                <div className="text-center mb-10">
                    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold uppercase tracking-wider mb-4">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                        Mock Tests &amp; Practice
                    </span>
                    <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">Test Series</h1>
                    <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                        Sharpen your skills with curated test series. Real exam patterns, instant scoring, and detailed analytics.
                    </p>
                    <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-gray-500">
                        <span className="flex items-center gap-1.5"><CheckIcon className="h-4 w-4 text-green-500" /> Instant results</span>
                        <span className="flex items-center gap-1.5"><CheckIcon className="h-4 w-4 text-green-500" /> Auto-saved progress</span>
                        <span className="flex items-center gap-1.5"><CheckIcon className="h-4 w-4 text-green-500" /> Detailed solutions</span>
                        <span className="flex items-center gap-1.5"><CheckIcon className="h-4 w-4 text-green-500" /> Mobile friendly</span>
                    </div>
                </div>

                {/* Search + Sort Bar */}
                <div className="mb-6 flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            type="search"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search by title, description, or tag..."
                            aria-label="Search test series"
                            className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        />
                    </div>
                    <select
                        value={accessFilter}
                        onChange={(e) => setAccessFilter(e.target.value as any)}
                        aria-label="Filter by access"
                        className="px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    >
                        <option value="all">All Access</option>
                        <option value="free">Free Only</option>
                        <option value="paid">Premium Only</option>
                    </select>
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as SortOption)}
                        aria-label="Sort tests"
                        className="px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    >
                        <option value="newest">Newest First</option>
                        <option value="price-low">Price: Low to High</option>
                        <option value="price-high">Price: High to Low</option>
                        <option value="questions">Most Questions</option>
                    </select>
                </div>

                {/* Category chips */}
                {categories.length > 0 && (
                    <div className="mb-6 flex flex-wrap gap-2">
                        <button
                            onClick={() => setCategoryFilter("")}
                            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                                categoryFilter === ""
                                    ? "bg-indigo-600 text-white"
                                    : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
                            }`}
                        >
                            All Categories
                        </button>
                        {categories.map((category) => (
                            <button
                                key={category}
                                onClick={() => setCategoryFilter(category)}
                                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                                    categoryFilter === category
                                        ? "bg-indigo-600 text-white"
                                        : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
                                }`}
                            >
                                {category}
                            </button>
                        ))}
                    </div>
                )}

                {/* Result count */}
                {!loading && (
                    <div className="mb-4 text-sm text-gray-500" role="status" aria-live="polite">
                        Showing <span className="font-bold text-gray-900">{visibleTests.length}</span> of {tests.length} test series
                    </div>
                )}

                {/* Tests Grid */}
                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <Card key={i} className="overflow-hidden">
                                <div className="h-48 bg-gray-100 animate-pulse" />
                                <div className="p-6 space-y-3">
                                    <div className="h-5 bg-gray-100 rounded animate-pulse w-3/4" />
                                    <div className="h-4 bg-gray-100 rounded animate-pulse w-full" />
                                    <div className="h-4 bg-gray-100 rounded animate-pulse w-2/3" />
                                    <div className="flex justify-between pt-3 border-t border-gray-100">
                                        <div className="h-7 bg-gray-100 rounded animate-pulse w-20" />
                                        <div className="h-9 bg-gray-100 rounded animate-pulse w-28" />
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                ) : visibleTests.length === 0 ? (
                    <Card className="p-12 text-center">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-bold text-gray-900">No test series match your filters</h3>
                        <p className="text-gray-500 mt-2 text-sm">Try removing a filter or adjusting your search.</p>
                        {(searchQuery || categoryFilter || accessFilter !== "all") && (
                            <Button
                                variant="outline"
                                className="mt-5"
                                onClick={() => { setSearchQuery(""); setCategoryFilter(""); setAccessFilter("all"); }}
                            >
                                Clear all filters
                            </Button>
                        )}
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {visibleTests.map((test) => (
                            <Card key={test.id} className="overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group">
                                {/* Thumbnail */}
                                <div className="h-48 bg-gradient-to-br from-indigo-500 to-purple-600 relative overflow-hidden">
                                    {test.thumbnailURL ? (
                                        <img
                                            src={test.thumbnailURL}
                                            alt={test.title}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-white/40">
                                            <FileTextIcon className="h-16 w-16" />
                                        </div>
                                    )}
                                    {test.accessType === "free" && (
                                        <span className="absolute top-4 right-4 bg-green-500 text-white px-3 py-1 rounded-full text-sm font-medium">
                                            Free
                                        </span>
                                    )}
                                    {test.accessType === "paid" && test.compareAtPrice && test.compareAtPrice > test.price && (
                                        <span className="absolute top-4 right-4 bg-red-500 text-white px-3 py-1 rounded-full text-sm font-medium">
                                            Sale
                                        </span>
                                    )}
                                </div>

                                {/* Content */}
                                <div className="p-6">
                                    <h3 className="text-xl font-bold text-gray-900 mb-2 line-clamp-2">
                                        {test.title}
                                    </h3>
                                    <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                                        {test.shortDescription}
                                    </p>

                                    {/* Stats */}
                                    <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
                                        <span className="flex items-center gap-1">
                                            <FlaskIcon className="h-4 w-4" />
                                            {test.totalTests} tests
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <BookOpenIcon className="h-4 w-4" />
                                            {test.totalQuestions} Qs
                                        </span>
                                    </div>

                                    {/* Price & CTA */}
                                    <div className="flex items-center justify-between pt-4 border-t">
                                        <div>
                                            {test.accessType === "free" ? (
                                                <span className="text-2xl font-bold text-green-600">Free</span>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-2xl font-bold text-gray-900">₹{test.price}</span>
                                                    {test.compareAtPrice && test.compareAtPrice > test.price && (
                                                        <span className="text-sm text-gray-500 line-through">
                                                            ₹{test.compareAtPrice}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <Link href={`/tests/${test.slug}`} aria-label={`View ${test.title}`}>
                                            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white group-hover:shadow-md">
                                                {test.accessType === "free" ? "Start Free" : "View Details"}
                                            </Button>
                                        </Link>
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
