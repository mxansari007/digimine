"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { slugify } from "@digimine/utils";
import { NumberInput } from "@digimine/shared";
import { createTestSeries } from "@/lib/firestore/tests";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { FileUpload } from "@/components/common/FileUpload";
import type { CreateTestSeriesInput } from "@digimine/types";

export default function CreateTestSeriesPage() {
    const router = useRouter();
    const { user } = useAdminAuth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // While untouched, the slug tracks the title live (fixing a title typo
    // fixes the slug too); editing it by hand takes the title out of the loop.
    const [slugTouched, setSlugTouched] = useState(false);

    const [formData, setFormData] = useState<
        Omit<CreateTestSeriesInput, "price" | "compareAtPrice"> & {
            // Nullable so the price fields can be cleared; coerced at submit.
            price: number | null;
            compareAtPrice: number | null;
        }
    >({
        title: "",
        slug: "",
        description: "",
        shortDescription: "",
        thumbnailURL: "",
        status: "draft",
        accessType: "paid",
        price: null,
        compareAtPrice: null,
        category: "",
        subcategory: "",
        tags: [],
        instantResults: true,
        allowRetake: false,
        shuffleQuestions: false,
        shuffleOptions: false,
        metaTitle: "",
        metaDescription: "",
        highlights: [],
    });

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

    const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const title = e.target.value;
        setFormData((prev) => ({
            ...prev,
            title,
            // Keep the slug in sync with the title until the user takes it over.
            slug: slugTouched ? prev.slug : slugify(title),
        }));
    };

    // Slug accepts raw typing, normalised on blur + submit. Clearing it hands
    // control back to the title.
    const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setSlugTouched(value.trim().length > 0);
        setFormData((prev) => ({ ...prev, slug: value }));
    };

    const handleSlugBlur = () => {
        setFormData((prev) => ({ ...prev, slug: slugify(prev.slug) }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            if (!user?.id) {
                throw new Error("You must be logged in to create a test series");
            }

            // Normalise the slug and coerce the nullable price fields to numbers.
            await createTestSeries(
                {
                    ...formData,
                    slug: slugify(formData.slug || formData.title),
                    price: Number(formData.price) || 0,
                    compareAtPrice: Number(formData.compareAtPrice) || undefined,
                },
                user.id
            );
            router.push("/tests");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create test series");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/tests">
                    <Button variant="outline" size="sm">
                        ← Back
                    </Button>
                </Link>
                <h1 className="text-2xl font-bold text-gray-900">Create Test Series</h1>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                    {error}
                </div>
            )}

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
                                onChange={handleTitleChange}
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
                                onChange={handleSlugChange}
                                onBlur={handleSlugBlur}
                                required
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                            <p className="mt-1 text-xs text-gray-400">
                                Auto-filled from the title; edit to customise. Must be unique.
                            </p>
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
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Short Description *</label>
                            <input
                                type="text"
                                name="shortDescription"
                                value={formData.shortDescription}
                                onChange={handleChange}
                                required
                                maxLength={200}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Full Description</label>
                            <textarea
                                name="description"
                                value={formData.description}
                                onChange={handleChange}
                                rows={4}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
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
                                    <NumberInput
                                        value={formData.price}
                                        onValueChange={(v) => setFormData((prev) => ({ ...prev, price: v }))}
                                        min={0}
                                        placeholder="0"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Compare at Price (₹)</label>
                                    <NumberInput
                                        value={formData.compareAtPrice}
                                        onValueChange={(v) => setFormData((prev) => ({ ...prev, compareAtPrice: v }))}
                                        min={0}
                                        placeholder="0"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                </div>
                            </>
                        )}
                    </div>
                </Card>

                <Card className="p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Default Settings for Tests</h2>
                    <p className="text-sm text-gray-500 mb-4">These settings will be applied to new tests created within this series by default.</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                name="instantResults"
                                checked={formData.instantResults}
                                onChange={(e) => setFormData((prev) => ({ ...prev, instantResults: e.target.checked }))}
                                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                            />
                            <span className="text-sm text-gray-700">Instant Results</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                name="allowRetake"
                                checked={formData.allowRetake}
                                onChange={(e) => setFormData((prev) => ({ ...prev, allowRetake: e.target.checked }))}
                                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                            />
                            <span className="text-sm text-gray-700">Allow Retake</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                name="shuffleQuestions"
                                checked={formData.shuffleQuestions}
                                onChange={(e) => setFormData((prev) => ({ ...prev, shuffleQuestions: e.target.checked }))}
                                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                            />
                            <span className="text-sm text-gray-700">Shuffle Questions</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                name="shuffleOptions"
                                checked={formData.shuffleOptions}
                                onChange={(e) => setFormData((prev) => ({ ...prev, shuffleOptions: e.target.checked }))}
                                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                            />
                            <span className="text-sm text-gray-700">Shuffle Options</span>
                        </label>
                    </div>
                </Card>

                <div className="flex gap-4">
                    <Button type="submit" disabled={loading}>
                        {loading ? "Creating..." : "Create Test Series"}
                    </Button>
                    <Link href="/tests">
                        <Button type="button" variant="outline">Cancel</Button>
                    </Link>
                </div>
            </form>
        </div>
    );
}
