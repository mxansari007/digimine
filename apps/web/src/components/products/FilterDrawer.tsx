"use client";

import { useEffect, useState } from "react";
import { FilterSidebar, type ProductFilters } from "./FilterSidebar";
import { Button } from "@digimine/ui";

interface FilterDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    onFilterChange: (filters: ProductFilters) => void;
    initialFilters?: ProductFilters;
}

export function FilterDrawer({ isOpen, onClose, onFilterChange, initialFilters }: FilterDrawerProps) {
    const [isAnimating, setIsAnimating] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setIsAnimating(true);
            document.body.style.overflow = "hidden";
        } else {
            const timer = setTimeout(() => setIsAnimating(false), 300);
            document.body.style.overflow = "";
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    if (!isOpen && !isAnimating) return null;

    return (
        <div className="fixed inset-0 z-50 lg:hidden pointer-events-none">
            {/* Backdrop */}
            <div
                className={`absolute inset-0 bg-black/50 transition-opacity duration-300 pointer-events-auto ${isOpen ? "opacity-100" : "opacity-0"
                    }`}
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Bottom Sheet */}
            <div
                className={`absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl transform transition-transform duration-300 ease-out pointer-events-auto max-h-[85vh] flex flex-col ${isOpen ? "translate-y-0" : "translate-y-full"
                    }`}
            >
                {/* Handle bar for dragging visual cue */}
                <div className="flex items-center justify-center pt-3 pb-2" onClick={onClose}>
                    <div className="w-12 h-1.5 bg-gray-200 rounded-full" />
                </div>

                {/* Header */}
                <div className="px-6 pb-4 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="font-display text-xl font-bold text-gray-900">Filters</h2>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-50 bg-gray-50"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    <FilterSidebar
                        onFilterChange={(filters) => {
                            onFilterChange(filters);
                        }}
                        initialFilters={initialFilters}
                    />
                </div>

                {/* Footer Actions */}
                <div className="p-6 border-t border-gray-100 bg-gray-50/50">
                    <Button
                        className="w-full py-3"
                        onClick={onClose}
                    >
                        Show Results
                    </Button>
                </div>
            </div>
        </div>
    );
}
