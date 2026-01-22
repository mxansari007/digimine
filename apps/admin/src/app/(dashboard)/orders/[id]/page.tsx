"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { doc, getDoc, type DocumentSnapshot, type DocumentData } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { type Order, type Product, type User } from "@digimine/types";
import { formatCurrency, formatDate } from "@digimine/utils";
import { Card, Button } from "@digimine/ui";

export default function OrderDetailsPage({ params }: { params: { id: string } }) {
    const [order, setOrder] = useState<Order | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchOrderDetails() {
            try {
                const orderDoc = await getDoc(doc(db, "orders", params.id));
                if (!orderDoc.exists()) return;

                const orderData = {
                    id: orderDoc.id,
                    ...orderDoc.data(),
                    createdAt: orderDoc.data().createdAt?.toDate()
                } as Order;

                setOrder(orderData);

                // Fetch User and Products in parallel
                // Only fetch user if userId exists
                const userPromise = orderData.userId
                    ? getDoc(doc(db, "users", orderData.userId))
                    : Promise.resolve(null);

                const productPromises = orderData.items.map(item =>
                    getDoc(doc(db, "products", item.productId))
                );

                const [productSnapshots, userSnap] = await Promise.all([
                    Promise.all(productPromises),
                    userPromise,
                ]);

                // Calculate product metrics
                const productList = productSnapshots
                    .filter((p): p is DocumentSnapshot<DocumentData> => p !== null && p.exists())
                    .map((p) => ({ id: p.id, ...p.data() } as Product));

                // Parse user data safely
                const userData = (userSnap && userSnap.exists())
                    ? ({ id: userSnap.id, ...userSnap.data(), createdAt: userSnap.data().createdAt?.toDate() } as User)
                    : undefined;

                setProducts(productList);

                // If it's a guest order, we might construct a temporary user object from email
                if (userData) {
                    setUser(userData);
                } else if (orderData.customerEmail) {
                    // Fallback for guest checkout display
                    setUser({
                        id: "guest",
                        email: orderData.customerEmail,
                        displayName: "Guest Customer",
                        role: "customer",
                        photoURL: null,
                        createdAt: orderData.createdAt,
                        updatedAt: orderData.createdAt
                    } as User);
                }

            } catch (error) {
                console.error("Error fetching details:", error);
            } finally {
                setLoading(false);
            }
        }
        fetchOrderDetails();
    }, [params.id]);

    if (loading) return <div>Loading details...</div>;
    if (!order) return <div>Order not found</div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/orders" className="text-gray-500 hover:text-gray-900">
                    &larr; Back
                </Link>
                <h1 className="text-2xl font-bold text-gray-900">Order #{order.id}</h1>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <Card padding="lg">
                        <h3 className="font-semibold text-gray-900 mb-4">Ordered Items</h3>
                        <div className="space-y-4">
                            {order.items.map((item, i) => {
                                const product = products.find(p => p.id === item.productId);
                                return (
                                    <div key={i} className="flex justify-between items-center py-3 border-b border-gray-100 last:border-0">
                                        <div>
                                            <div className="font-medium text-gray-900">{product?.name || "Unknown Product"}</div>
                                            <div className="text-sm text-gray-500">Qty: {item.quantity}</div>
                                        </div>
                                        <div className="font-medium">
                                            {formatCurrency(item.price)}
                                        </div>
                                    </div>
                                );
                            })}
                            <div className="pt-4 flex justify-between items-center text-lg font-bold">
                                <span>Total</span>
                                <span>{formatCurrency(order.total)}</span>
                            </div>
                        </div>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card padding="lg">
                        <h3 className="font-semibold text-gray-900 mb-4">Customer Info</h3>
                        {user ? (
                            <div className="space-y-2 text-sm">
                                <div className="flex items-center gap-2">
                                    <div className="font-medium text-gray-900">Name:</div>
                                    <div>{user.displayName || "N/A"}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="font-medium text-gray-900">Email:</div>
                                    <div>{user.email}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="font-medium text-gray-900">User ID:</div>
                                    <div className="text-xs text-gray-500 font-mono">{user.id}</div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-gray-500 text-sm">User details not available</div>
                        )}
                    </Card>

                    <Card padding="lg">
                        <h3 className="font-semibold text-gray-900 mb-4">Order Status</h3>
                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${order.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-primary-100 text-primary-800'
                                    }`}>
                                    {order.status.toUpperCase()}
                                </span>
                            </div>
                            <div className="text-sm text-gray-500">
                                Placed on {formatDate(order.createdAt)}
                            </div>

                            {/* Placeholder Actions */}
                            <div className="pt-4 space-y-2">
                                <Button className="w-full text-xs" variant="outline" size="sm">
                                    Send Receipt Email
                                </Button>
                                <Button className="w-full text-xs text-red-600 border-red-200 hover:bg-red-50" variant="outline" size="sm">
                                    Refund Order
                                </Button>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}
