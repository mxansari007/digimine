import type { OrderItem } from "./order";

/**
 * Checkout session state
 */
export interface CheckoutSession {
    id: string;
    guestId: string; // Temporary ID stored in cookie
    email?: string;
    items: OrderItem[];
    subtotal: number;
    status: "cart" | "email_captured" | "processing" | "completed" | "abandoned";
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Payment intent (Mock or Real)
 */
export interface PaymentIntent {
    id: string;
    amount: number;
    currency: string;
    status: "pending" | "succeeded" | "failed";
    clientSecret?: string;
}

/**
 * User purchase mapping
 * Links a guest purchase to a potential or future user
 */
export interface UserPurchaseMapping {
    email: string; // The link key
    orderIds: string[];
    isClaimed: boolean; // True if user account exists and is linked
    userId?: string; // The linked user ID
}
