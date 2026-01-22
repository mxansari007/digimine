"use client";

import { useState } from "react";
import { Button } from "@digimine/ui";

interface HighlightsEditorProps {
    highlights: string[];
    onChange: (highlights: string[]) => void;
}

export function HighlightsEditor({ highlights, onChange }: HighlightsEditorProps) {
    const [newHighlight, setNewHighlight] = useState("");

    const addHighlight = () => {
        if (!newHighlight.trim()) return;
        onChange([...highlights, newHighlight.trim()]);
        setNewHighlight("");
    };

    const removeHighlight = (index: number) => {
        onChange(highlights.filter((_, i) => i !== index));
    };

    const moveHighlight = (index: number, direction: "up" | "down") => {
        const newIndex = direction === "up" ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= highlights.length) return;
        const newHighlights = [...highlights];
        [newHighlights[index], newHighlights[newIndex]] = [newHighlights[newIndex], newHighlights[index]];
        onChange(newHighlights);
    };

    return (
        <div className="space-y-3">
            {/* Existing highlights */}
            {highlights.length > 0 && (
                <div className="space-y-2">
                    {highlights.map((highlight, index) => (
                        <div
                            key={index}
                            className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg group"
                        >
                            <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span className="flex-1 text-sm text-gray-700">{highlight}</span>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {index > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => moveHighlight(index, "up")}
                                        className="p-1 text-gray-400 hover:text-gray-600"
                                    >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                        </svg>
                                    </button>
                                )}
                                {index < highlights.length - 1 && (
                                    <button
                                        type="button"
                                        onClick={() => moveHighlight(index, "down")}
                                        className="p-1 text-gray-400 hover:text-gray-600"
                                    >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => removeHighlight(index)}
                                    className="p-1 text-red-400 hover:text-red-600"
                                >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Add new highlight */}
            <div className="flex gap-2">
                <input
                    type="text"
                    value={newHighlight}
                    onChange={(e) => setNewHighlight(e.target.value)}
                    placeholder="Add a key benefit or feature..."
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-100 outline-none"
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addHighlight())}
                />
                <Button type="button" variant="outline" size="sm" onClick={addHighlight}>
                    Add
                </Button>
            </div>

            {highlights.length === 0 && (
                <p className="text-xs text-gray-500 text-center py-2">
                    Add key selling points that will be displayed with checkmarks
                </p>
            )}
        </div>
    );
}
