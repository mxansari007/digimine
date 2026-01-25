"use client";

import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    limit,
    Timestamp,
    type DocumentData,
} from "firebase/firestore";
import { db } from "../firebase/client"; // Use local init
import type { User, Product, ProductFile, Order, Review, CreateReviewInput } from "@digimine/types";
import { v4 as uuidv4 } from "uuid";

// Collection Refs
const usersCollection = collection(db, "users");
const productsCollection = collection(db, "products");
const ordersCollection = collection(db, "orders");
const reviewsCollection = collection(db, "reviews");

// --- Users ---

export async function getAllUsers(): Promise<User[]> {
    const q = query(usersCollection, orderBy("createdAt", "desc"), limit(100)); // Limit for safety
    const snapshot = await getDocs(q);
    return mapDocs<User>(snapshot);
}

export async function getUser(userId: string): Promise<User | null> {
    const docRef = doc(usersCollection, userId);
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) return null;
    return mapDoc<User>(snapshot);
}

// --- Products ---

export async function getAllProducts(filters?: { type?: string; purchaseType?: string }): Promise<Product[]> {
    let q = query(productsCollection, orderBy("createdAt", "desc"));

    if (filters?.type) {
        q = query(q, where("type", "==", filters.type));
    }

    if (filters?.purchaseType) {
        q = query(q, where("purchaseType", "==", filters.purchaseType));
    }

    const snapshot = await getDocs(q);
    return mapDocs<Product>(snapshot);
}

export async function getProduct(productId: string): Promise<Product | null> {
    const docRef = doc(productsCollection, productId);
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) return null;

    const product = mapDoc<Product>(snapshot);

    // Fetch files from subcollection
    const filesCollection = collection(docRef, "files");
    const filesSnapshot = await getDocs(filesCollection);
    const files = mapDocs<ProductFile>(filesSnapshot);

    return {
        ...product,
        files: files.length > 0 ? files : [],
    };
}

export async function createProduct(
    data: Omit<Product, "id" | "createdAt" | "updatedAt">
): Promise<string> {
    // Use slug as the document ID for cleaner URLs and direct fetching
    if (!data.slug) {
        throw new Error("Slug is required for creating a product");
    }
    const docRef = doc(productsCollection, data.slug);
    const now = Timestamp.now();

    // Separate files for subcollection (secure storage)
    const { files, ...productData } = data;

    // Robustly clean data using JSON serialization (strips undefineds)
    // We can do this because Product data doesn't contain Date objects (we add timestamps separately)
    const cleanedData = JSON.parse(JSON.stringify(productData));

    console.log("Creating product with sanitized data:", cleanedData);

    await setDoc(docRef, {
        ...cleanedData,
        createdAt: now,
        updatedAt: now,
    });

    // Write files to subcollection for secure access
    if (files && files.length > 0) {
        const filesCollection = collection(docRef, "files");
        for (const file of files) {
            await setDoc(doc(filesCollection, file.id), file);
        }
    }

    return docRef.id;
}

// Helper to recursively remove undefined values from objects
function removeUndefined(obj: any): any {
    if (obj === null || obj === undefined) {
        return null;
    }
    if (Array.isArray(obj)) {
        return obj.map(item => removeUndefined(item));
    }
    if (typeof obj === 'object' && !(obj instanceof Date) && !(obj instanceof Timestamp)) {
        const cleaned: Record<string, any> = {};
        for (const [key, value] of Object.entries(obj)) {
            if (value !== undefined) {
                cleaned[key] = removeUndefined(value);
            }
        }
        return cleaned;
    }
    return obj;
}

export async function updateProduct(
    productId: string,
    data: Partial<Product>
): Promise<void> {
    const docRef = doc(productsCollection, productId);

    // Separate files for subcollection
    const { files, ...productData } = data;

    // Deep clean to remove all undefined values (including nested) by using JSON serialization
    // This aligns with the createProduct fix and avoids "Invalid time value" or undefined errors
    const cleanedData = JSON.parse(JSON.stringify(productData));

    console.log("Updating product with sanitized data:", cleanedData);

    await updateDoc(docRef, {
        ...cleanedData,
        updatedAt: Timestamp.now(),
    });

    // Update files subcollection if files are provided
    if (files) {
        const filesCollection = collection(docRef, "files");
        // For simplicity, delete existing and re-add (could be optimized)
        const existingFiles = await getDocs(filesCollection);
        for (const existingFile of existingFiles.docs) {
            await deleteDoc(existingFile.ref);
        }
        for (const file of files) {
            await setDoc(doc(filesCollection, file.id), file);
        }
    }
}

export async function deleteProduct(productId: string): Promise<void> {
    await deleteDoc(doc(productsCollection, productId));
}

// --- Orders ---

export async function getAllOrders(): Promise<Order[]> {
    const q = query(ordersCollection, orderBy("createdAt", "desc"), limit(50));
    const snapshot = await getDocs(q);
    return mapDocs<Order>(snapshot);
}

// --- Reviews ---

export async function getProductReviews(productId: string): Promise<Review[]> {
    const q = query(
        reviewsCollection,
        where("productId", "==", productId),
        orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(q);
    return mapDocs<Review>(snapshot);
}

export async function createFakeReview(input: CreateReviewInput & { authorName: string; reviewDate?: Date }): Promise<Review> {
    const reviewId = uuidv4();
    const now = Timestamp.now();
    const reviewTimestamp = input.reviewDate ? Timestamp.fromDate(input.reviewDate) : now;

    const review: Review = {
        id: reviewId,
        productId: input.productId,
        userId: null,
        authorName: input.authorName,
        rating: input.rating,
        title: input.title,
        content: input.content,
        isVerifiedPurchase: false,
        isFake: true,
        createdAt: reviewTimestamp.toDate(),
        updatedAt: now.toDate(),
    };

    await setDoc(doc(reviewsCollection, reviewId), {
        ...review,
        createdAt: reviewTimestamp,
        updatedAt: now,
    });

    return review;
}

export async function deleteReview(reviewId: string): Promise<void> {
    await deleteDoc(doc(reviewsCollection, reviewId));
}

// --- Helpers ---

function mapDoc<T>(snapshot: DocumentData): T {
    const data = snapshot.data();

    // Helper to safely parse dates
    const toDate = (val: any): Date => {
        if (!val) return new Date(); // Fallback to now if missing
        if (val?.toDate && typeof val.toDate === 'function') {
            try {
                return val.toDate();
            } catch (e) {
                console.warn("Failed to convert Timestamp to Date:", e);
                return new Date();
            }
        }
        if (val instanceof Date) return val;
        // Try parsing string/number, fallback to now if invalid
        const d = new Date(val);
        return isNaN(d.getTime()) ? new Date() : d;
    };

    return {
        ...data,
        id: snapshot.id,
        createdAt: toDate(data.createdAt),
        updatedAt: toDate(data.updatedAt),
    } as T;
}

function mapDocs<T>(snapshot: any): T[] {
    return snapshot.docs.map((doc: any) => mapDoc<T>(doc));
}
