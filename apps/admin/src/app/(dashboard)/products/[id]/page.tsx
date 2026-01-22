"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getProduct } from "@/lib/firestore/admin";
import { ProductForm } from "@/components/products/ProductForm";
import type { Product } from "@digimine/types";

export default function EditProductPage({ params }: { params: { id: string } }) {
    const [product, setProduct] = useState<Product | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetch() {
            try {
                const data = await getProduct(params.id);
                setProduct(data);
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        }
        fetch();
    }, [params.id]);

    if (loading) return <div>Loading...</div>;
    if (!product) return <div>Product not found</div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/products" className="text-gray-500 hover:text-gray-900">
                    &larr; Back
                </Link>
                <h1 className="text-2xl font-bold text-gray-900">Edit Product</h1>
            </div>

            <ProductForm initialData={product} />
        </div>
    );
}
