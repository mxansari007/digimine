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
import type { User, Product, Order } from "@digimine/types";

// Collection Refs
const usersCollection = collection(db, "users");
const productsCollection = collection(db, "products");
const ordersCollection = collection(db, "orders");

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

export async function getAllProducts(): Promise<Product[]> {
    const q = query(productsCollection, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    return mapDocs<Product>(snapshot);
}

export async function getProduct(productId: string): Promise<Product | null> {
    const docRef = doc(productsCollection, productId);
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) return null;
    return mapDoc<Product>(snapshot);
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

    await setDoc(docRef, {
        ...productData,
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

    // Deep clean to remove all undefined values (including nested)
    const cleanedData = removeUndefined(productData);

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

// --- Helpers ---

function mapDoc<T>(snapshot: DocumentData): T {
    const data = snapshot.data();
    return {
        ...data,
        id: snapshot.id,
        createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
        updatedAt: data.updatedAt?.toDate?.() || new Date(data.updatedAt),
    } as T;
}

function mapDocs<T>(snapshot: any): T[] {
    return snapshot.docs.map((doc: any) => mapDoc<T>(doc));
}
