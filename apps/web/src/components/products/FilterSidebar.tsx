"use client";

import { useState } from "react";
import { type ProductType, type PurchaseType } from "@digimine/types";
import { Button } from "@digimine/ui";

interface FilterSidebarProps {
    onFilterChange: (filters: ProductFilters) => void;
    initialFilters?: ProductFilters;
    className?: string; // Add className prop
}

export interface ProductFilters {
    categories: ProductType[];
    purchaseType: PurchaseType | "all";
    priceRange: { min: number; max: number | null };
}

const CATEGORIES: { label: string; value: ProductType }[] = [
    { label: "Test Series", value: "test_series" },
    { label: "eBooks", value: "ebook" },
    { label: "Courses", value: "course" },
    { label: "Templates", value: "template" },
    { label: "Software", value: "software" },
    { label: "Assets", value: "asset" },
    { label: "Spreadsheets", value: "spreadsheet" },
    { label: "AI Prompts", value: "ai-prompt" },
    { label: "Resources", value: "resource" },
];

export function FilterSidebar({ onFilterChange, initialFilters, className = "" }: FilterSidebarProps) {
    const [filters, setFilters] = useState<ProductFilters>(initialFilters || {
        categories: [],
        purchaseType: "all",
        priceRange: { min: 0, max: null }
    });

    const handleCategoryChange = (category: ProductType) => {
        setFilters(prev => {
            const newCategories = prev.categories.includes(category)
                ? prev.categories.filter(c => c !== category)
                : [...prev.categories, category];

            const newFilters = { ...prev, categories: newCategories };
            onFilterChange(newFilters);
            return newFilters;
        });
    };

    const handlePurchaseTypeChange = (type: PurchaseType | "all") => {
        setFilters(prev => {
            const newFilters = { ...prev, purchaseType: type };
            onFilterChange(newFilters);
            return newFilters;
        });
    };

    const clearFilters = () => {
        const emptyFilters: ProductFilters = {
            categories: [],
            purchaseType: "all",
            priceRange: { min: 0, max: null }
        };
        setFilters(emptyFilters);
        onFilterChange(emptyFilters);
    };

    return (
        <div className={`space-y-8 ${className}`}>
            {/* Categories */}
            <div>
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">
                    Categories
                </h3>
                <div className="space-y-3">
                    {CATEGORIES.map((category) => (
                        <label key={category.value} className="flex items-center gap-3 cursor-pointer group">
                            <div className="relative flex items-center">
                                <input
                                    type="checkbox"
                                    className="peer h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                    checked={filters.categories.includes(category.value)}
                                    onChange={() => handleCategoryChange(category.value)}
                                />
                            </div>
                            <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors">
                                {category.label}
                            </span>
                        </label>
                    ))}
                </div>
            </div>

            {/* Access Type */}
            <div>
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">
                    Access Type
                </h3>
                <div className="space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer group">
                        <input
                            type="radio"
                            name="purchaseType"
                            className="h-4 w-4 border-gray-300 text-primary-600 focus:ring-primary-500"
                            checked={filters.purchaseType === "all"}
                            onChange={() => handlePurchaseTypeChange("all")}
                        />
                        <span className="text-sm text-gray-600 group-hover:text-gray-900">All Products</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer group">
                        <input
                            type="radio"
                            name="purchaseType"
                            className="h-4 w-4 border-gray-300 text-primary-600 focus:ring-primary-500"
                            checked={filters.purchaseType === "downloadable"}
                            onChange={() => handlePurchaseTypeChange("downloadable")}
                        />
                        <span className="text-sm text-gray-600 group-hover:text-gray-900">One-time Purchase</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer group">
                        <input
                            type="radio"
                            name="purchaseType"
                            className="h-4 w-4 border-gray-300 text-primary-600 focus:ring-primary-500"
                            checked={filters.purchaseType === "subscription"}
                            onChange={() => handlePurchaseTypeChange("subscription")}
                        />
                        <span className="text-sm text-gray-600 group-hover:text-gray-900">Subscription</span>
                    </label>
                </div>
            </div>

            {/* Price Range - Simple for now */}
            {/* Future: Add min/max inputs or detailed slider */}

            {/* Actions */}
            {(filters.categories.length > 0 || filters.purchaseType !== "all") && (
                <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-gray-600"
                    onClick={clearFilters}
                >
                    Clear Filters
                </Button>
            )}
        </div>
    );
}
