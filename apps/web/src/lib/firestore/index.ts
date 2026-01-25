"use client";

import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    query,
    where,
    orderBy,
    limit,
    Timestamp,
    type QueryConstraint,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { Product, Order, User, Review, CreateReviewInput, UpdateReviewInput } from "@digimine/types";
import { v4 as uuidv4 } from "uuid";

// Collection references
export const usersCollection = collection(db, "users");
export const productsCollection = collection(db, "products");
export const ordersCollection = collection(db, "orders");
export const reviewsCollection = collection(db, "reviews");

/**
 * Get a single product by ID
 */
export async function getProduct(productId: string): Promise<Product | null> {
    const snapshot = await getDoc(doc(productsCollection, productId));
    if (!snapshot.exists()) return null;

    const data = snapshot.data();
    return {
        ...data,
        id: snapshot.id,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
    } as Product;
}

/**
 * Get a product by slug (slug is the document ID)
 */
export async function getProductBySlug(slug: string): Promise<Product | null> {
    // Since we use slug as the document ID, fetch directly
    const snapshot = await getDoc(doc(productsCollection, slug));

    if (!snapshot.exists()) return null;

    const data = snapshot.data();
    return {
        ...data,
        id: snapshot.id,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
    } as Product;
}

/**
 * Get published products with optional filters
 */
export async function getProducts(options?: {
    type?: string | string[];
    limitCount?: number;
    orderByField?: string;
}): Promise<Product[]> {
    const constraints: QueryConstraint[] = [
        where("status", "==", "published"),
    ];

    if (options?.type) {
        if (Array.isArray(options.type)) {
            // Firestore 'in' query supports up to 10 values
            if (options.type.length > 0) {
                constraints.push(where("type", "in", options.type));
            }
        } else {
            constraints.push(where("type", "==", options.type));
        }
    }

    if (options?.orderByField) {
        constraints.push(orderBy(options.orderByField, "desc"));
    } else {
        constraints.push(orderBy("createdAt", "desc"));
    }

    if (options?.limitCount) {
        constraints.push(limit(options.limitCount));
    }

    const q = query(productsCollection, ...constraints);
    const snapshot = await getDocs(q);

    return snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
            ...data,
            id: docSnap.id,
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || new Date(),
        } as Product;
    });
}

/**
 * Get orders for a user
 */
export async function getUserOrders(userId: string): Promise<Order[]> {
    const q = query(
        ordersCollection,
        where("userId", "==", userId),
        orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
            ...data,
            id: docSnap.id,
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || new Date(),
        } as Order;
    });
}

/**
 * Get user profile by ID
 */
export async function getUserProfile(userId: string): Promise<User | null> {
    const snapshot = await getDoc(doc(usersCollection, userId));
    if (!snapshot.exists()) return null;

    const data = snapshot.data();
    return {
        ...data,
        id: snapshot.id,
        purchasedProducts: data.purchasedProducts || [],
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
    } as User;
}

/**
 * Get product files from subcollection (buyer-only access enforced by Firestore rules)
 */
export async function getProductFiles(productId: string): Promise<{ id: string; name: string; url: string; size: number; mimeType: string }[]> {
    try {
        const filesCollection = collection(db, "products", productId, "files");
        const snapshot = await getDocs(filesCollection);

        return snapshot.docs.map(docSnap => ({
            id: docSnap.id,
            ...docSnap.data()
        })) as { id: string; name: string; url: string; size: number; mimeType: string }[];
    } catch (error) {
        console.error("Error fetching product files:", error);
        return [];
    }
}

// --- Reviews ---

/**
 * Get product review stats (average rating and count)
 */
export async function getProductReviewStats(productId: string): Promise<{ averageRating: number; reviewCount: number }> {
    const reviews = await getProductReviews(productId);
    if (reviews.length === 0) {
        return { averageRating: 0, reviewCount: 0 };
    }
    const averageRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
    return { averageRating: Math.round(averageRating * 10) / 10, reviewCount: reviews.length };
}

/**
 * Get review stats for all products (batch fetch for listing pages)
 * Returns a map of productId -> { averageRating, reviewCount }
 */
export async function getAllReviewStats(): Promise<Map<string, { averageRating: number; reviewCount: number }>> {
    const snapshot = await getDocs(reviewsCollection);
    const statsMap = new Map<string, { sum: number; count: number }>();

    snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        const productId = data.productId;
        const rating = data.rating || 0;

        if (!statsMap.has(productId)) {
            statsMap.set(productId, { sum: 0, count: 0 });
        }
        const current = statsMap.get(productId)!;
        current.sum += rating;
        current.count += 1;
    });

    const result = new Map<string, { averageRating: number; reviewCount: number }>();
    statsMap.forEach((stats, productId) => {
        result.set(productId, {
            averageRating: Math.round((stats.sum / stats.count) * 10) / 10,
            reviewCount: stats.count
        });
    });

    return result;
}

/**
 * Get all reviews for a product
 */
export async function getProductReviews(productId: string): Promise<Review[]> {
    const q = query(
        reviewsCollection,
        where("productId", "==", productId),
        orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
            ...data,
            id: docSnap.id,
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || new Date(),
        } as Review;
    });
}

/**
 * Get a user's review for a specific product
 */
export async function getUserReview(productId: string, userId: string): Promise<Review | null> {
    const q = query(
        reviewsCollection,
        where("productId", "==", productId),
        where("userId", "==", userId),
        limit(1)
    );
    const snapshot = await getDocs(q);

    if (snapshot.empty) return null;

    const docSnap = snapshot.docs[0];
    const data = docSnap.data();
    return {
        ...data,
        id: docSnap.id,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
    } as Review;
}

/**
 * Check if user has purchased a product
 */
export async function hasUserPurchased(productId: string, userId: string): Promise<boolean> {
    // Check orders collection for completed orders containing this product
    const q = query(
        ordersCollection,
        where("userId", "==", userId),
        where("status", "==", "completed")
    );
    const snapshot = await getDocs(q);

    for (const docSnap of snapshot.docs) {
        const order = docSnap.data() as Order;
        if (order.items?.some(item => item.productId === productId)) {
            return true;
        }
    }
    return false;
}

/**
 * Create a new review (for authenticated users who purchased)
 */
export async function createReview(
    input: CreateReviewInput,
    userId: string,
    authorName: string,
    authorEmail?: string
): Promise<Review> {
    const reviewId = uuidv4();
    const now = Timestamp.now();

    const review: Review = {
        id: reviewId,
        productId: input.productId,
        userId,
        authorName,
        authorEmail,
        rating: input.rating,
        title: input.title || "",
        content: input.content || "",
        isVerifiedPurchase: true,
        isFake: false,
        createdAt: now.toDate(),
        updatedAt: now.toDate(),
    };

    await setDoc(doc(reviewsCollection, reviewId), {
        ...review,
        createdAt: now,
        updatedAt: now,
    });

    return review;
}

/**
 * Update an existing review
 */
export async function updateReview(reviewId: string, input: UpdateReviewInput): Promise<void> {
    const now = Timestamp.now();
    await updateDoc(doc(reviewsCollection, reviewId), {
        ...input,
        updatedAt: now,
    });
}
