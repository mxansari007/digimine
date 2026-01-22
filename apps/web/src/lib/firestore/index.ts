"use client";

import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
    limit,
    type QueryConstraint,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { Product, Order, User } from "@digimine/types";

// Collection references
export const usersCollection = collection(db, "users");
export const productsCollection = collection(db, "products");
export const ordersCollection = collection(db, "orders");

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
    type?: string;
    limitCount?: number;
    orderByField?: string;
}): Promise<Product[]> {
    const constraints: QueryConstraint[] = [
        where("status", "==", "published"),
    ];

    if (options?.type) {
        constraints.push(where("type", "==", options.type));
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
