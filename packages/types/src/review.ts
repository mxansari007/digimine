/**
 * Product Review interface
 */
export interface Review {
    id: string;
    productId: string;
    userId: string | null; // null for admin-created fake reviews
    authorName: string;
    authorEmail?: string;
    rating: number; // 1-5
    title?: string;
    content?: string;
    isVerifiedPurchase: boolean;
    isFake: boolean; // Admin-created
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Review creation input
 */
export interface CreateReviewInput {
    productId: string;
    rating: number;
    title?: string;
    content?: string;
    authorName?: string; // For admin fake reviews
    isFake?: boolean;
}

/**
 * Review update input
 */
export interface UpdateReviewInput {
    rating?: number;
    title?: string;
    content?: string;
}
