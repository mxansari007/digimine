"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getAllProducts } from "@/lib/firestore/admin";
import { type Product } from "@digimine/types";
import { formatCurrency, formatDate } from "@digimine/utils";
import { Button, Card } from "@digimine/ui";

export default function ProductsPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterType, setFilterType] = useState<string>("");
    const [filterPurchaseType, setFilterPurchaseType] = useState<string>("");

    useEffect(() => {
        async function fetchProducts() {
            setLoading(true);
            try {
                // Pass filters to the fetch function
                // Explicitly send undefined if filter is empty string
                const filters = {
                    type: filterType || undefined,
                    purchaseType: filterPurchaseType || undefined
                };
                const data = await getAllProducts(filters);
                setProducts(data);
            } catch (error) {
                console.error("Error fetching products:", error);
            } finally {
                setLoading(false);
            }
        }
        fetchProducts();
    }, [filterType, filterPurchaseType]);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center flex-wrap gap-4">
                <h1 className="text-2xl font-bold text-gray-900">Products</h1>
                <Link href="/products/create">
                    <Button variant="primary" className="flex items-center gap-2">
                        <span>+ Create Product</span>
                    </Button>
                </Link>
            </div>

            {/* Filters */}
            <Card padding="md" className="flex flex-wrap gap-4">
                <div className="w-full sm:w-auto">
                    <label htmlFor="filterType" className="block text-sm font-medium text-gray-700 mb-1">Product Type</label>
                    <select
                        id="filterType"
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className="w-full sm:w-48 px-3 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-primary-100 outline-none"
                    >
                        <option value="">All Types</option>
                        <option value="ebook">eBook</option>
                        <option value="course">Course</option>
                        <option value="template">Template</option>
                        <option value="software">Software</option>
                        <option value="asset">Digital Asset</option>
                        <option value="spreadsheet">Spreadsheet</option>
                        <option value="ai-prompt">AI Prompt</option>
                        <option value="resource">Resource</option>
                        <option value="subscription">Subscription</option>
                        <option value="other">Other</option>
                    </select>
                </div>
                <div className="w-full sm:w-auto">
                    <label htmlFor="filterPurchaseType" className="block text-sm font-medium text-gray-700 mb-1">Purchase Type</label>
                    <select
                        id="filterPurchaseType"
                        value={filterPurchaseType}
                        onChange={(e) => setFilterPurchaseType(e.target.value)}
                        className="w-full sm:w-48 px-3 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-primary-100 outline-none"
                    >
                        <option value="">All</option>
                        <option value="downloadable">One-time Purchase</option>
                        <option value="subscription">Subscription</option>
                    </select>
                </div>
                <div className="w-full sm:w-auto flex items-end">
                    {(filterType || filterPurchaseType) && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                setFilterType("");
                                setFilterPurchaseType("");
                            }}
                            className="text-gray-600 border-gray-300"
                        >
                            Clear Filters
                        </Button>
                    )}
                </div>
            </Card>

            <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                    {loading ? (
                        <div className="p-8 text-center text-gray-500">Loading products...</div>
                    ) : (
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Product Details
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Type
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Purchase
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Price
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Status
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Last Updated
                                    </th>
                                    <th className="relative px-6 py-3">
                                        <span className="sr-only">Actions</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {products.map((product) => (
                                    <tr key={product.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center">
                                                <div className="h-10 w-10 flex-shrink-0 bg-gray-100 rounded-md overflow-hidden">
                                                    {product.thumbnailURL ? (
                                                        <img src={product.thumbnailURL} alt="" className="h-full w-full object-cover" />
                                                    ) : (
                                                        <div className="h-full w-full flex items-center justify-center text-gray-400">?</div>
                                                    )}
                                                </div>
                                                <div className="ml-4">
                                                    <div className="text-sm font-medium text-gray-900 line-clamp-1 max-w-[200px]">
                                                        {product.name}
                                                    </div>
                                                    <div className="text-sm text-gray-500">
                                                        /{product.slug}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">
                                            {product.type}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">
                                            {product.purchaseType === 'subscription' ? (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                                    Sub ({product.subscriptionDuration}d)
                                                </span>
                                            ) : 'One-time'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold">
                                            {formatCurrency(product.price)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${product.status === 'published' ? 'bg-green-100 text-green-800' :
                                                product.status === 'draft' ? 'bg-gray-100 text-gray-800' :
                                                    'bg-red-100 text-red-800'
                                                }`}>
                                                {product.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {formatDate(product.updatedAt || product.createdAt)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <Link href={`/products/${product.id}`} className="text-primary-600 hover:text-primary-900">
                                                Edit
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                                {products.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                                            No products found matching filters.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </Card>
        </div>
    );
}
