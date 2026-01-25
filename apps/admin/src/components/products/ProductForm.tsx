"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createProduct, updateProduct, deleteProduct } from "@/lib/firestore/admin";
import { type Product } from "@digimine/types";
import { Button, Card } from "@digimine/ui";
import { FileUpload } from "@/components/common/FileUpload";
import { GalleryUpload } from "@/components/common/GalleryUpload";
import { ContentPreviewEditor } from "@/components/common/ContentPreviewEditor";
import { HighlightsEditor } from "@/components/common/HighlightsEditor";
import { ReviewManager } from "@/components/products/ReviewManager";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

interface ProductFormProps {
    initialData?: Product;
}

export function ProductForm({ initialData }: ProductFormProps) {
    const router = useRouter();
    const { user } = useAdminAuth();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        name: initialData?.name || "",
        slug: initialData?.slug || "",
        description: initialData?.description || "",
        shortDescription: initialData?.shortDescription || "",
        price: initialData?.price || 0,
        compareAtPrice: initialData?.compareAtPrice || 0,
        type: initialData?.type || "ebook",
        purchaseType: initialData?.purchaseType || "downloadable",
        subscriptionDuration: initialData?.subscriptionDuration || 30,
        status: initialData?.status || "draft",
        thumbnailURL: initialData?.thumbnailURL || "",
        files: initialData?.files || [],
        tags: initialData?.tags || [],
        images: initialData?.images || [],
        contentPreview: initialData?.contentPreview || [],
        highlights: initialData?.highlights || [],
        deliveryFormat: initialData?.deliveryFormat || "pdf",
        moneyBackGuarantee: initialData?.moneyBackGuarantee || 30,
        instantAccess: initialData?.instantAccess ?? true,
        previewUrl: initialData?.previewUrl || "",
    });

    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
    ) => {
        const { name, value, type } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: type === "checkbox"
                ? (e.target as HTMLInputElement).checked
                : (name === "price" || name === "compareAtPrice" || name === "moneyBackGuarantee" || name === "subscriptionDuration")
                    ? parseFloat(value) || 0
                    : value,
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            if (initialData?.id) {
                // Update doesn't need createdBy as it's partial
                await updateProduct(initialData.id, formData);
            } else {
                // Create needs full object
                await createProduct({
                    ...formData,
                    createdBy: user?.id || "admin", // Fallback if user not loaded yet, though auth context should handle it
                });
            }
            router.push("/products");
            router.refresh();
        } catch (err: any) {
            console.error(err);
            setError(err.message || "Something went wrong saving the product");
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!initialData?.id || !confirm("Are you sure you want to delete this product?")) return;

        setIsLoading(true);
        try {
            await deleteProduct(initialData.id);
            router.push("/products");
            router.refresh();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    // Auto-generate slug from name if empty
    const handleTitleBlur = () => {
        if (!formData.slug && formData.name) {
            setFormData(prev => ({
                ...prev,
                slug: formData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '')
            }));
        }
    };

    return (
        <>
            <form onSubmit={handleSubmit} className="space-y-8">
                {error && (
                    <div className="bg-red-50 text-red-600 p-4 rounded-lg">
                        {error}
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-6">
                        <Card padding="lg">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Product Name
                                    </label>
                                    <input
                                        name="name"
                                        type="text"
                                        required
                                        value={formData.name}
                                        onChange={handleChange}
                                        onBlur={handleTitleBlur}
                                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                                        placeholder="e.g. Modern Marketing Guide"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Slug (URL)
                                    </label>
                                    <div className="flex">
                                        <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
                                            digimine.com/products/
                                        </span>
                                        <input
                                            name="slug"
                                            type="text"
                                            required
                                            value={formData.slug}
                                            onChange={handleChange}
                                            className="flex-1 min-w-0 block w-full px-4 py-2 border rounded-r-lg focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Description
                                    </label>
                                    <textarea
                                        name="description"
                                        rows={5}
                                        value={formData.description}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                                        placeholder="Describe your digital product..."
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Short Description
                                    </label>
                                    <textarea
                                        name="shortDescription"
                                        rows={2}
                                        value={formData.shortDescription}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                                        placeholder="Brief tagline shown in product cards..."
                                        maxLength={150}
                                    />
                                    <p className="text-xs text-gray-500 mt-1">{formData.shortDescription.length}/150 characters</p>
                                </div>
                            </div>
                        </Card>

                        {/* Key Highlights Section */}
                        <Card padding="lg">
                            <h3 className="font-semibold text-gray-900 mb-2">Key Highlights</h3>
                            <p className="text-sm text-gray-500 mb-4">
                                Add compelling selling points shown with checkmarks on the product page
                            </p>
                            <HighlightsEditor
                                highlights={formData.highlights}
                                onChange={(highlights) => setFormData(prev => ({ ...prev, highlights }))}
                            />
                        </Card>

                        <Card padding="lg">
                            <h3 className="font-semibold text-gray-900 mb-4">Digital Files</h3>
                            <div className="space-y-6">
                                <FileUpload
                                    label="Thumbnail Image"
                                    path="products/thumbnails"
                                    accept="image/*"
                                    existingUrl={formData.thumbnailURL || undefined}
                                    onUploadComplete={(url) => setFormData(prev => ({ ...prev, thumbnailURL: url }))}
                                />

                                {/* Simplified file upload for now - just one file supported in UI but keeping array structure */}
                                <FileUpload
                                    label="Product File (Downloadable)"
                                    path="products/files"
                                    existingUrl={formData.files?.[0]?.url}
                                    onUploadComplete={(url) => setFormData(prev => ({
                                        ...prev,
                                        files: [{
                                            id: Date.now().toString(),
                                            name: 'Main File',
                                            url: url,
                                            size: 0,
                                            mimeType: 'application/octet-stream'
                                        }]
                                    }))}
                                />
                            </div>
                        </Card>

                        {/* Gallery Images Section */}
                        <Card padding="lg">
                            <h3 className="font-semibold text-gray-900 mb-4">Gallery Images</h3>
                            <p className="text-sm text-gray-500 mb-4">
                                Add up to 6 images to showcase your product. The first image will be displayed as the main gallery image.
                            </p>
                            <GalleryUpload
                                label="Product Gallery"
                                path="products/gallery"
                                images={formData.images}
                                onImagesChange={(images) => setFormData(prev => ({ ...prev, images }))}
                                maxImages={6}
                            />
                        </Card>

                        {/* Content Preview Section */}
                        <Card padding="lg">
                            <h3 className="font-semibold text-gray-900 mb-4">What's Included</h3>
                            <p className="text-sm text-gray-500 mb-4">
                                Define the files and folders customers will receive. This will be shown on the product page with a lock icon.
                            </p>
                            <ContentPreviewEditor
                                items={formData.contentPreview}
                                onChange={(contentPreview) => setFormData(prev => ({ ...prev, contentPreview }))}
                            />
                        </Card>
                    </div>

                    <div className="space-y-6">
                        <Card padding="lg">
                            <h3 className="font-semibold text-gray-900 mb-4">Pricing & Status</h3>
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Price (₹)
                                        </label>
                                        <input
                                            name="price"
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            required
                                            value={formData.price}
                                            onChange={handleChange}
                                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Compare At (₹)
                                        </label>
                                        <input
                                            name="compareAtPrice"
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={formData.compareAtPrice}
                                            onChange={handleChange}
                                            placeholder="Original price"
                                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Product Type
                                    </label>
                                    <select
                                        name="type"
                                        value={formData.type}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2 border rounded-lg bg-white"
                                    >
                                        <option value="ebook">eBook</option>
                                        <option value="course">Course</option>
                                        <option value="template">Template</option>
                                        <option value="software">Software</option>
                                        <option value="asset">Digital Asset</option>
                                        <option value="spreadsheet">Spreadsheet</option>
                                        <option value="ai-prompt">AI Prompt</option>
                                        <option value="resource">Resource</option>
                                        <option value="subscription">Subscription</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Purchase Type
                                    </label>
                                    <select
                                        name="purchaseType"
                                        value={formData.purchaseType}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2 border rounded-lg bg-white"
                                    >
                                        <option value="downloadable">One-time Purchase (Downloadable)</option>
                                        <option value="subscription">Subscription (Recurring Access)</option>
                                    </select>
                                </div>

                                {formData.purchaseType === "subscription" && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Duration (Days)
                                        </label>
                                        <select
                                            name="subscriptionDuration"
                                            value={formData.subscriptionDuration}
                                            onChange={handleChange}
                                            className="w-full px-4 py-2 border rounded-lg bg-white"
                                        >
                                            <option value={7}>7 Days</option>
                                            <option value={14}>14 Days</option>
                                            <option value={30}>30 Days (1 Month)</option>
                                            <option value={90}>90 Days (3 Months)</option>
                                            <option value={180}>180 Days (6 Months)</option>
                                            <option value={365}>365 Days (1 Year)</option>
                                        </select>
                                    </div>
                                )}

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Delivery Format
                                    </label>
                                    <select
                                        name="deliveryFormat"
                                        value={formData.deliveryFormat}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2 border rounded-lg bg-white"
                                    >
                                        <option value="pdf">PDF Download</option>
                                        <option value="video">Video Course</option>
                                        <option value="audio">Audio Files</option>
                                        <option value="zip">ZIP Archive</option>
                                        <option value="online">Online Access</option>
                                        <option value="software">Software/App</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Money-Back Guarantee
                                    </label>
                                    <select
                                        name="moneyBackGuarantee"
                                        value={formData.moneyBackGuarantee}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2 border rounded-lg bg-white"
                                    >
                                        <option value={0}>No Guarantee</option>
                                        <option value={7}>7-Day Guarantee</option>
                                        <option value={14}>14-Day Guarantee</option>
                                        <option value={30}>30-Day Guarantee</option>
                                        <option value={60}>60-Day Guarantee</option>
                                        <option value={90}>90-Day Guarantee</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Status
                                    </label>
                                    <select
                                        name="status"
                                        value={formData.status}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2 border rounded-lg bg-white"
                                    >
                                        <option value="draft">Draft</option>
                                        <option value="published">Published</option>
                                        <option value="archived">Archived</option>
                                    </select>
                                </div>

                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        name="instantAccess"
                                        type="checkbox"
                                        checked={formData.instantAccess}
                                        onChange={handleChange}
                                        className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                    />
                                    <span className="text-sm font-medium text-gray-700">Instant Access Badge</span>
                                </label>
                            </div>
                        </Card>

                        <div className="flex flex-col gap-3">
                            <Button type="submit" variant="primary" size="lg" isLoading={isLoading}>
                                {initialData ? "Save Changes" : "Create Product"}
                            </Button>

                            {initialData && (
                                <Button type="button" variant="outline" onClick={handleDelete} className="text-red-600 border-red-200 hover:bg-red-50">
                                    Delete Product
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </form>

            {/* Review Manager - Only show for existing products */}
            {
                initialData && (
                    <div className="mt-8">
                        <ReviewManager productId={initialData.id} />
                    </div>
                )
            }
        </>
    );
}
