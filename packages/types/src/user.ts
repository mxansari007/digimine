/**
 * User role types
 */
export type UserRole = "customer" | "admin" | "super_admin";

/**
 * User profile interface
 */
export interface User {
    id: string;
    email: string;
    displayName: string | null;
    photoURL: string | null;
    role: UserRole;
    purchasedProducts: string[]; // Array of product IDs/slugs the user has purchased
    createdAt: Date;
    updatedAt: Date;
}

/**
 * User creation input
 */
export interface CreateUserInput {
    email: string;
    displayName?: string;
    role?: UserRole;
}

/**
 * User update input
 */
export interface UpdateUserInput {
    displayName?: string;
    photoURL?: string;
    role?: UserRole;
}
