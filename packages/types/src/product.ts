/**
 * Product status types
 */
export type ProductStatus = "draft" | "published" | "archived";

/**
 * Product type - digital product categories
 */
export type ProductType = "ebook" | "course" | "template" | "software" | "asset" | "spreadsheet" | "ai-prompt" | "resource" | "subscription" | "other";

/**
 * Purchase type - how the product is accessed
 */
export type PurchaseType = "downloadable" | "subscription";

/**
 * Delivery format options for digital products
 */
export type DeliveryFormat = "pdf" | "video" | "audio" | "zip" | "online" | "software" | "other";

/**
 * Digital product file
 */
export interface ProductFile {
    id: string;
    name: string;
    url: string;
    size: number;
    mimeType: string;
}

/**
 * Content preview item - for showing what's included (files/folders with lock icon)
 */
export interface ContentPreviewItem {
    id: string;
    name: string;
    type: "file" | "folder";
    children?: ContentPreviewItem[]; // For folders
}

/**
 * Product interface
 */
export interface Product {
    id: string;
    name: string;
    slug: string;
    description: string;
    shortDescription: string;
    price: number;
    compareAtPrice?: number; // Original price for strikethrough
    type: ProductType;
    purchaseType: PurchaseType; // downloadable or subscription
    subscriptionDuration?: number; // Days for subscription (30, 90, 365)
    status: ProductStatus;
    thumbnailURL: string | null;
    images: string[];
    files: ProductFile[];
    contentPreview: ContentPreviewItem[]; // What's included preview
    tags: string[];
    // Conversion-focused fields
    highlights: string[]; // Key selling points/features
    deliveryFormat: DeliveryFormat; // How the product is delivered
    moneyBackGuarantee: number; // Days of guarantee (0 = none, 30, 60, 90)
    instantAccess: boolean; // Show "Instant Access" badge
    previewUrl?: string; // Sample/preview content link
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
}

/**
 * Product creation input
 */
export interface CreateProductInput {
    name: string;
    slug: string;
    description: string;
    shortDescription: string;
    price: number;
    compareAtPrice?: number;
    type: ProductType;
    purchaseType?: PurchaseType; // defaults to "downloadable"
    subscriptionDuration?: number;
    status?: ProductStatus;
    thumbnailURL?: string;
    images?: string[];
    contentPreview?: ContentPreviewItem[];
    tags?: string[];
    highlights?: string[];
    deliveryFormat?: DeliveryFormat;
    moneyBackGuarantee?: number;
    instantAccess?: boolean;
    previewUrl?: string;
}

/**
 * Product update input
 */
export interface UpdateProductInput extends Partial<CreateProductInput> {
    files?: ProductFile[];
}
