"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { Button, Card } from "@digimine/ui";
import { getTestSeries, updateTestSeries } from "@/lib/firestore/tests";
import { FileUpload } from "@/components/common/FileUpload";
import type { TestSeries, TestStatus, TestAccessType } from "@digimine/types";

export default function EditTestSeriesPage() {
    const router = useRouter();
    const params = useParams();
    const seriesId = params.id as string;

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [series, setSeries] = useState<TestSeries | null>(null);

    const [formData, setFormData] = useState({
        title: "",
        slug: "",
        description: "",
        shortDescription: "",
        thumbnailURL: "",
        status: "draft" as TestStatus,
        accessType: "paid" as TestAccessType,
        price: 0,
        compareAtPrice: 0,
        category: "",
        subcategory: "",
        tags: "",
        instantResults: true,
        allowRetake: false,
        shuffleQuestions: false,
        shuffleOptions: false,
        metaTitle: "",
        metaDescription: "",
        highlights: "",
    });

    useEffect(() => {
        loadSeries();
    }, [seriesId]);

    async function loadSeries() {
        try {
            setLoading(true);
            const data = await getTestSeries(seriesId);
            if (!data) {
                setError("Series not found");
                return;
            }
            setSeries(data);

            setFormData({
                title: data.title,
                slug: data.slug,
                description: data.description,
                shortDescription: data.shortDescription,
                thumbnailURL: data.thumbnailURL || "",
                status: data.status,
                accessType: data.accessType,
                price: data.price,
                compareAtPrice: data.compareAtPrice || 0,
                category: data.category || "",
                subcategory: data.subcategory || "",
                tags: data.tags?.join(", ") || "",
                instantResults: data.instantResults,
                allowRetake: data.allowRetake,
                shuffleQuestions: data.shuffleQuestions,
                shuffleOptions: data.shuffleOptions,
                metaTitle: data.metaTitle || "",
                metaDescription: data.metaDescription || "",
                highlights: data.highlights?.join("\n") || "",
            });
        } catch (err) {
            setError("Failed to load series");
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;

        if (type === "checkbox") {
            const checked = (e.target as HTMLInputElement).checked;
            setFormData((prev) => ({ ...prev, [name]: checked }));
        } else if (type === "number") {
            setFormData((prev) => ({ ...prev, [name]: parseFloat(value) || 0 }));
        } else {
            setFormData((prev) => ({ ...prev, [name]: value }));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError("");

        try {
            await updateTestSeries({
                id: seriesId,
                title: formData.title,
                slug: formData.slug,
                description: formData.description,
                shortDescription: formData.shortDescription,
                thumbnailURL: formData.thumbnailURL || undefined,
                status: formData.status,
                accessType: formData.accessType,
                price: formData.price,
                compareAtPrice: formData.compareAtPrice || undefined,
                category: formData.category || undefined,
                subcategory: formData.subcategory || undefined,
                tags: formData.tags.split(",").map((t) => t.trim()).filter(Boolean),
                instantResults: formData.instantResults,
                allowRetake: formData.allowRetake,
                shuffleQuestions: formData.shuffleQuestions,
                shuffleOptions: formData.shuffleOptions,
                metaTitle: formData.metaTitle || undefined,
                metaDescription: formData.metaDescription || undefined,
                highlights: formData.highlights.split("\n").map((h) => h.trim()).filter(Boolean),
            });

            router.push("/tests");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to update series");
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-8 text-center">Loading...</div>;
    if (error && !series) return <div className="p-8 text-center text-red-500">{error}</div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/tests">
                    <Button variant="outline" size="sm">← Back</Button>
                </Link>
                <h1 className="text-2xl font-bold text-gray-900">Edit Test Series</h1>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                <Card className="p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                            <input
                                type="text"
                                name="title"
                                value={formData.title}
                                onChange={handleChange}
                                required
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Slug *</label>
                            <input
                                type="text"
                                name="slug"
                                value={formData.slug}
                                onChange={handleChange}
                                required
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <FileUpload
                                label="Thumbnail Image"
                                path="tests/thumbnails"
                                accept="image/*"
                                existingUrl={formData.thumbnailURL || undefined}
                                onUploadComplete={(url) => setFormData(prev => ({ ...prev, thumbnailURL: url }))}
                            />
                        </div>
                    </div>
                </Card>

                <Card className="p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Pricing & Access</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Access Type</label>
                            <select
                                name="accessType"
                                value={formData.accessType}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            >
                                <option value="free">Free</option>
                                <option value="paid">Paid</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                            <select
                                name="status"
                                value={formData.status}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            >
                                <option value="draft">Draft</option>
                                <option value="published">Published</option>
                                <option value="archived">Archived</option>
                            </select>
                        </div>
                        {formData.accessType === "paid" && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Price (₹)</label>
                                    <input
                                        type="number"
                                        name="price"
                                        value={formData.price}
                                        onChange={handleChange}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Compare at Price (₹)</label>
                                    <input
                                        type="number"
                                        name="compareAtPrice"
                                        value={formData.compareAtPrice}
                                        onChange={handleChange}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                </div>
                            </>
                        )}
                    </div>
                </Card>

                <div className="flex gap-4">
                    <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                        {saving ? "Saving..." : "Save Changes"}
                    </Button>
                    <Link href="/tests">
                        <Button type="button" variant="outline">Cancel</Button>
                    </Link>
                </div>
            </form>
        </div>
    );
}
