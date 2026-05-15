import type { Product } from "./product";
import type { User } from "./user";

/**
 * Order status types
 */
export type OrderStatus = "pending" | "completed" | "refunded" | "failed";

/**
 * Payment method types
 */
export type PaymentMethod = "stripe" | "paypal" | "razorpay" | "instamojo" | "free";

/**
 * Order item interface
 */
export interface OrderItem {
    productId: string;
    productName: string;
    price: number;
    quantity: number;
    productImage?: string | null;
}

/**
 * Order interface
 */
export interface Order {
    id: string;
    userId: string | null; // Optional for guest checkout
    customerEmail: string; // Required for all orders (primary key for guests)
    customerPhone?: string; // Phone number for delivery/contact
    guestId?: string; // Optional session ID for tracking
    items: OrderItem[];
    subtotal: number;
    discount: number;
    total: number;
    status: OrderStatus;
    paymentMethod: PaymentMethod;
    paymentId: string | null;
    accessKey?: string;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Order creation input
 */
export interface CreateOrderInput {
    items: Array<{
        productId: string;
        quantity: number;
    }>;
    paymentMethod: PaymentMethod;
    couponCode?: string;
}

/**
 * Order with related data
 */
export interface OrderWithDetails extends Order {
    user?: User;
    products?: Product[];
}
