/**
 * User role types
 */
export type UserRole = "customer" | "admin" | "super_admin";

/**
 * Purchase record for tracking product access and subscription expiry
 */
export interface PurchaseRecord {
    productId: string;
    purchasedAt: Date;
    expiresAt: Date | null; // null = lifetime access (downloadable), Date = subscription expiry
}

/**
 * User profile interface
 */
export interface User {
    id: string;
    email: string;
    displayName: string | null;
    firstName: string | null;
    lastName: string | null;
    phoneNumber: string | null;
    photoURL: string | null;
    role: UserRole;
    // Legacy: string[] for backward compatibility, new: PurchaseRecord[]
    purchasedProducts: string[] | PurchaseRecord[];
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Helper to check if purchasedProducts is legacy format
 */
export function isLegacyPurchaseFormat(purchases: string[] | PurchaseRecord[]): purchases is string[] {
    if (purchases.length === 0) return true;
    return typeof purchases[0] === 'string';
}

/**
 * Helper to get product IDs from purchases (works with both formats)
 */
export function getPurchasedProductIds(purchases: string[] | PurchaseRecord[]): string[] {
    if (isLegacyPurchaseFormat(purchases)) {
        return purchases;
    }
    return purchases.map(p => p.productId);
}

/**
 * Helper to check if user has active access to a product
 */
export function hasActiveAccess(purchases: string[] | PurchaseRecord[], productId: string): boolean {
    if (isLegacyPurchaseFormat(purchases)) {
        return purchases.includes(productId);
    }
    const purchase = purchases.find(p => p.productId === productId);
    if (!purchase) return false;
    // Check if lifetime access or not expired
    if (purchase.expiresAt === null) return true;
    return new Date(purchase.expiresAt) > new Date();
}

/**
 * User creation input
 */
export interface CreateUserInput {
    email: string;
    displayName?: string;
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    role?: UserRole;
}

/**
 * User update input
 */
export interface UpdateUserInput {
    displayName?: string;
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    photoURL?: string;
    role?: UserRole;
}
