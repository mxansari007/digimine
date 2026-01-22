"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { OrderItem, CheckoutSession } from "@digimine/types";
import { v4 as uuidv4 } from "uuid";

interface CartContextValue {
    items: OrderItem[];
    addItem: (item: OrderItem) => void;
    removeItem: (productId: string) => void;
    clearCart: () => void;
    subtotal: number;
    guestId: string;
    email: string | undefined;
    setEmail: (email: string) => void;
    // Drawer state
    isDrawerOpen: boolean;
    openDrawer: () => void;
    closeDrawer: () => void;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
    const [items, setItems] = useState<OrderItem[]>([]);
    const [guestId, setGuestId] = useState("");
    const [email, setEmail] = useState<string | undefined>(undefined);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    useEffect(() => {
        // Init guest ID
        let storedGuestId = localStorage.getItem("guestId");
        if (!storedGuestId) {
            storedGuestId = uuidv4();
            localStorage.setItem("guestId", storedGuestId);
        }
        setGuestId(storedGuestId);

        // Load cart from local storage
        const storedCart = localStorage.getItem("cart");
        if (storedCart) {
            try {
                setItems(JSON.parse(storedCart));
            } catch (e) {
                console.error("Failed to parse cart", e);
            }
        }
    }, []);

    useEffect(() => {
        // Persist cart
        if (items.length > 0) {
            localStorage.setItem("cart", JSON.stringify(items));
        }
    }, [items]);

    const addItem = (newItem: OrderItem) => {
        setItems((prev) => {
            // For digital products, don't allow duplicates - you only need one copy
            const existing = prev.find((i) => i.productId === newItem.productId);
            if (existing) {
                return prev; // Already in cart, don't add again
            }
            return [...prev, { ...newItem, quantity: 1 }];
        });
    };

    const removeItem = (productId: string) => {
        setItems((prev) => prev.filter((i) => i.productId !== productId));
    };

    const clearCart = () => {
        setItems([]);
        localStorage.removeItem("cart");
    };

    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    // Drawer controls
    const openDrawer = useCallback(() => setIsDrawerOpen(true), []);
    const closeDrawer = useCallback(() => setIsDrawerOpen(false), []);

    return (
        <CartContext.Provider
            value={{
                items,
                addItem,
                removeItem,
                clearCart,
                subtotal,
                guestId,
                email,
                setEmail,
                isDrawerOpen,
                openDrawer,
                closeDrawer,
            }}
        >
            {children}
        </CartContext.Provider>
    );
}

export function useCart() {
    const context = useContext(CartContext);
    if (context === undefined) {
        throw new Error("useCart must be used within a CartProvider");
    }
    return context;
}

