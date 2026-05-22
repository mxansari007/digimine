"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { BookOpenIcon, FileTextIcon, FlaskIcon } from "@/components/icons/AppIcons";
import type { TestCard } from "@/lib/server/catalog";

type SortOption = "newest" | "price-low" | "price-high" | "questions";

/**
 * Client-side search / sort / category filter for the test-series catalog,
 * seeded with `tests` fetched on the server — so the SSR HTML already contains
 * every test card and link (crawlable) and filtering is instant in the browser.
 */
export default function TestsBrowser({ tests }: { tests: TestCard[] }) {
    const [categoryFilter, setCategoryFilter] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState<SortOption>("newest");
    const [accessFilter, setAccessFilter] = useState<"all" | "free" | "paid">("all");

    const categories = useMemo(
        () => [...new Set(tests.map((t) => t.category).filter((c): c is string => Boolean(c)))],
        [tests]
    );

    const visibleTests = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        let list = tests.filter((t) => {
            const matchesSearch =
                !q ||
                t.title.toLowerCase().includes(q) ||
                t.shortDescription.toLowerCase().includes(q) ||
                t.tags.some((tag) => tag.toLowerCase().includes(q));
            const matchesAccess = accessFilter === "all" || t.accessType === accessFilter;
            const matchesCategory = !categoryFilter || t.category === categoryFilter;
            return matchesSearch && matchesAccess && matchesCategory;
        });
        switch (sortBy) {
            case "price-low":
                list = [...list].sort((a, b) => a.price - b.price);
                break;
            case "price-high":
                list = [...list].sort((a, b) => b.price - a.price);
                break;
            case "questions":
                list = [...list].sort((a, b) => b.totalQuestions - a.totalQuestions);
                break;
            case "newest":
            default:
                list = [...list].sort((a, b) => b.createdAtMs - a.createdAtMs);
        }
        return list;
    }, [tests, searchQuery, accessFilter, categoryFilter, sortBy]);

    return (
        <>
            {/* Search + Sort Bar */}
            <div className="mb-6 flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                    <svg className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by title, description, or tag..."
                        aria-label="Search test series"
                        className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
                    />
                </div>
                <select value={accessFilter} onChange={(e) => setAccessFilter(e.target.value as typeof accessFilter)} aria-label="Filter by access" className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500">
                    <option value="all">All Access</option>
                    <option value="free">Free Only</option>
                    <option value="paid">Premium Only</option>
                </select>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)} aria-label="Sort tests" className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500">
                    <option value="newest">Newest First</option>
                    <option value="price-low">Price: Low to High</option>
                    <option value="price-high">Price: High to Low</option>
                    <option value="questions">Most Questions</option>
                </select>
            </div>

            {/* Category chips */}
            {categories.length > 0 && (
                <div className="mb-6 flex flex-wrap gap-2">
                    <button onClick={() => setCategoryFilter("")} className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${categoryFilter === "" ? "bg-indigo-600 text-white" : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-100"}`}>
                        All Categories
                    </button>
                    {categories.map((category) => (
                        <button key={category} onClick={() => setCategoryFilter(category)} className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${categoryFilter === category ? "bg-indigo-600 text-white" : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-100"}`}>
                            {category}
                        </button>
                    ))}
                </div>
            )}

            {/* Result count */}
            <div className="mb-4 text-sm text-gray-500" role="status" aria-live="polite">
                Showing <span className="font-bold text-gray-900">{visibleTests.length}</span> of {tests.length} test series
            </div>

            {visibleTests.length === 0 ? (
                <Card className="p-12 text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-gray-400">
                        <FileTextIcon className="h-8 w-8" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">No test series match your filters</h3>
                    <p className="mt-2 text-sm text-gray-500">Try removing a filter or adjusting your search.</p>
                    {(searchQuery || categoryFilter || accessFilter !== "all") && (
                        <Button variant="outline" className="mt-5" onClick={() => { setSearchQuery(""); setCategoryFilter(""); setAccessFilter("all"); }}>
                            Clear all filters
                        </Button>
                    )}
                </Card>
            ) : (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {visibleTests.map((test) => (
                        <Card key={test.id} className="group overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
                            <div className="relative h-48 overflow-hidden bg-gradient-to-br from-indigo-500 to-purple-600">
                                {test.thumbnailURL ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={test.thumbnailURL} alt={test.title} className="h-full w-full object-cover" />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center text-white/40">
                                        <FileTextIcon className="h-16 w-16" />
                                    </div>
                                )}
                                {test.accessType === "free" && (
                                    <span className="absolute right-4 top-4 rounded-full bg-green-500 px-3 py-1 text-sm font-medium text-white">Free</span>
                                )}
                                {test.accessType === "paid" && test.compareAtPrice > test.price && (
                                    <span className="absolute right-4 top-4 rounded-full bg-red-500 px-3 py-1 text-sm font-medium text-white">Sale</span>
                                )}
                            </div>

                            <div className="p-6">
                                <h3 className="mb-2 line-clamp-2 text-xl font-bold text-gray-900">{test.title}</h3>
                                <p className="mb-4 line-clamp-2 text-sm text-gray-600">{test.shortDescription}</p>

                                <div className="mb-4 flex items-center gap-4 text-sm text-gray-500">
                                    <span className="flex items-center gap-1"><FlaskIcon className="h-4 w-4" />{test.totalTests} tests</span>
                                    <span className="flex items-center gap-1"><BookOpenIcon className="h-4 w-4" />{test.totalQuestions} Qs</span>
                                </div>

                                <div className="flex items-center justify-between border-t pt-4">
                                    <div>
                                        {test.accessType === "free" ? (
                                            <span className="text-2xl font-bold text-green-600">Free</span>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <span className="text-2xl font-bold text-gray-900">₹{test.price}</span>
                                                {test.compareAtPrice > test.price && (
                                                    <span className="text-sm text-gray-500 line-through">₹{test.compareAtPrice}</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <Link href={`/tests/${test.slug}`} aria-label={`View ${test.title}`}>
                                        <Button className="bg-indigo-600 text-white hover:bg-indigo-700 group-hover:shadow-md">
                                            {test.accessType === "free" ? "Start Free" : "View Details"}
                                        </Button>
                                    </Link>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </>
    );
}
