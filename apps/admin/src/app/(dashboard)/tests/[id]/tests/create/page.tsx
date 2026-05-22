"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button, Card } from "@digimine/ui";
import { getTestSeries, createTestInSeries } from "@/lib/firestore/tests";
import type { TestSeries, CreateTestInput, TestSectionInput } from "@digimine/types";
import Link from "next/link";

export default function CreateSubTestPage() {
    const params = useParams();
    const router = useRouter();
    const seriesId = params.id as string;

    const [series, setSeries] = useState<TestSeries | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [formData, setFormData] = useState<Partial<CreateTestInput>>({
        title: "",
        description: "",
        duration: 60,
        totalMarks: 100,
        passingMarks: 33,
        status: "draft",
        instantResults: true,
        allowRetake: false,
        shuffleQuestions: false,
        shuffleOptions: false,
        sections: [],
    });

    const sections = formData.sections || [];

    const addSection = () => {
        const nextSection: TestSectionInput = {
            id: crypto.randomUUID(),
            title: "",
            description: "",
            order: sections.length,
        };
        setFormData({ ...formData, sections: [...sections, nextSection] });
    };

    const updateSection = (index: number, field: "title" | "description", value: string) => {
        setFormData({
            ...formData,
            sections: sections.map((section, sectionIndex) =>
                sectionIndex === index ? { ...section, [field]: value } : section
            ),
        });
    };

    const updateSectionNumber = (index: number, field: "marksPerQuestion" | "negativeMarks" | "cutoffMarks", value: string) => {
        setFormData({
            ...formData,
            sections: sections.map((section, sectionIndex) =>
                sectionIndex === index
                    ? { ...section, [field]: value === "" ? undefined : Number(value) }
                    : section
            ),
        });
    };

    const removeSection = (index: number) => {
        setFormData({
            ...formData,
            sections: sections
                .filter((_, sectionIndex) => sectionIndex !== index)
                .map((section, order) => ({ ...section, order })),
        });
    };

    useEffect(() => {
        async function loadSeries() {
            try {
                const data = await getTestSeries(seriesId);
                setSeries(data);
                if (data) {
                    setFormData(prev => ({
                        ...prev,
                        instantResults: data.instantResults,
                        allowRetake: data.allowRetake,
                        shuffleQuestions: data.shuffleQuestions,
                        shuffleOptions: data.shuffleOptions,
                    }));
                }
            } catch (error) {
                console.error("Error loading series:", error);
            } finally {
                setLoading(false);
            }
        }
        loadSeries();
    }, [seriesId]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.title) {
            alert("Title is required");
            return;
        }

        setSaving(true);
        try {
            await createTestInSeries({
                seriesId,
                title: formData.title!,
                description: formData.description || "",
                duration: formData.duration || 60,
                totalMarks: formData.totalMarks || 100,
                passingMarks: formData.passingMarks || 33,
                status: formData.status as any,
                instantResults: formData.instantResults,
                allowRetake: formData.allowRetake,
                shuffleQuestions: formData.shuffleQuestions,
                shuffleOptions: formData.shuffleOptions,
                sections: sections.filter((section) => section.title.trim()),
            });
            router.push(`/tests/${seriesId}/tests`);
        } catch (error: any) {
            console.error("Error creating test:", error);
            alert("Failed to create test");
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-8 text-center">Loading...</div>;
    if (!series) return <div className="p-8 text-center">Series not found</div>;

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900">Add Test to {series.title}</h1>
                <Link href={`/tests/${seriesId}/tests`}>
                    <Button variant="outline">Cancel</Button>
                </Link>
            </div>

            <Card className="p-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Test Title *</label>
                            <input
                                type="text"
                                required
                                value={formData.title}
                                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                placeholder="e.g., General Studies Mock 1"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">Description</label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                rows={3}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Duration (mins)</label>
                                <input
                                    type="number"
                                    value={formData.duration}
                                    onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Total Marks</label>
                                <input
                                    type="number"
                                    value={formData.totalMarks}
                                    onChange={(e) => setFormData({ ...formData, totalMarks: parseInt(e.target.value) })}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Passing Marks</label>
                                <input
                                    type="number"
                                    value={formData.passingMarks}
                                    onChange={(e) => setFormData({ ...formData, passingMarks: parseInt(e.target.value) })}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                />
                            </div>
                        </div>

                        <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <h2 className="text-sm font-bold text-gray-900">Sections</h2>
                                    <p className="text-xs text-gray-500">Split this test into named sections like Quant, Reasoning, or English.</p>
                                </div>
                                <Button type="button" variant="outline" size="sm" onClick={addSection}>
                                    + Add Section
                                </Button>
                            </div>
                            {sections.length > 0 && (
                                <div className="space-y-3">
                                    {sections.map((section, index) => (
                                        <div key={section.id || index} className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-white p-3 md:grid-cols-7">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-600">Section Name</label>
                                                <input
                                                    type="text"
                                                    value={section.title}
                                                    onChange={(e) => updateSection(index, "title", e.target.value)}
                                                    placeholder={`Section ${index + 1}`}
                                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                                />
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className="block text-xs font-medium text-gray-600">Description</label>
                                                <input
                                                    type="text"
                                                    value={section.description || ""}
                                                    onChange={(e) => updateSection(index, "description", e.target.value)}
                                                    placeholder="Optional note shown to students"
                                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-600">Marks/Q</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step={0.5}
                                                    value={section.marksPerQuestion ?? ""}
                                                    onChange={(e) => updateSectionNumber(index, "marksPerQuestion", e.target.value)}
                                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-600">Negative</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step={0.25}
                                                    value={section.negativeMarks ?? ""}
                                                    onChange={(e) => updateSectionNumber(index, "negativeMarks", e.target.value)}
                                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-600">Cutoff</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step={0.5}
                                                    value={section.cutoffMarks ?? ""}
                                                    onChange={(e) => updateSectionNumber(index, "cutoffMarks", e.target.value)}
                                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                                />
                                            </div>
                                            <div className="flex items-end">
                                                <Button type="button" variant="outline" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => removeSection(index)}>
                                                    Remove
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t">
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="instantResults"
                                    checked={formData.instantResults}
                                    onChange={(e) => setFormData({ ...formData, instantResults: e.target.checked })}
                                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                />
                                <label htmlFor="instantResults" className="text-sm text-gray-700">Show results immediately</label>
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="allowRetake"
                                    checked={formData.allowRetake}
                                    onChange={(e) => setFormData({ ...formData, allowRetake: e.target.checked })}
                                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                />
                                <label htmlFor="allowRetake" className="text-sm text-gray-700">Allow multiple retakes</label>
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="shuffleQuestions"
                                    checked={formData.shuffleQuestions}
                                    onChange={(e) => setFormData({ ...formData, shuffleQuestions: e.target.checked })}
                                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                />
                                <label htmlFor="shuffleQuestions" className="text-sm text-gray-700">Shuffle questions</label>
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="shuffleOptions"
                                    checked={formData.shuffleOptions}
                                    onChange={(e) => setFormData({ ...formData, shuffleOptions: e.target.checked })}
                                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                />
                                <label htmlFor="shuffleOptions" className="text-sm text-gray-700">Shuffle MCQ options</label>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end pt-6 border-t">
                        <Button type="submit" disabled={saving}>
                            {saving ? "Saving..." : "Create Test"}
                        </Button>
                    </div>
                </form>
            </Card>
        </div>
    );
}
