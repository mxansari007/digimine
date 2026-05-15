import { ProductForm } from "@/components/products/ProductForm";
import Link from "next/link";

export default function CreateProductPage() {
    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <Link href="/products" className="text-gray-500 hover:text-gray-900">
                    &larr; Back
                </Link>
                <h1 className="text-2xl font-bold text-gray-900">Create New Product</h1>
            </div>

            <ProductForm />
        </div>
    );
}
