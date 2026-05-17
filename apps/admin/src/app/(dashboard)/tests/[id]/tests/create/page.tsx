"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button, Card } from "@digimine/ui";
import { getTestSeries, createTestInSeries } from "@/lib/firestore/tests";
import type { TestSeries, CreateTestInput } from "@digimine/types";
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
    });

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
                        <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                            {saving ? "Saving..." : "Create Test"}
                        </Button>
                    </div>
                </form>
            </Card>
        </div>
    );
}
