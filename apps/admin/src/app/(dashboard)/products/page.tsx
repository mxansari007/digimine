"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { downloadProductTemplate } from "@/lib/import/productTemplates";
import { type Product } from "@digimine/types";
import { formatCurrency, formatDate } from "@digimine/utils";
import {
    Button,
    Card,
    DataTable,
    PaginationControls,
    usePaginatedTable,
    type DataTableColumn,
} from "@digimine/ui";
import { authedFetch } from "@/lib/api";

export default function ProductsPage() {
    const [filterType, setFilterType] = useState<string>("");
    const [filterPurchaseType, setFilterPurchaseType] = useState<string>("");

    const load = useCallback(
        async ({ page, pageSize, signal }: { page: number; pageSize: number; signal: AbortSignal }) => {
            const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
            if (filterType) qs.set("type", filterType);
            if (filterPurchaseType) qs.set("purchaseType", filterPurchaseType);
            const res = await authedFetch(`/api/admin/products?${qs.toString()}`, { signal });
            if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Failed to load products");
            const data = await res.json();
            return { items: (data.items as Product[]) || [], total: (data.total as number) || 0 };
        },
        [filterType, filterPurchaseType]
    );
    const { items: products, total, page, pageSize, loading, setPage, setPageSize } = usePaginatedTable<Product>({
        load,
        initialPageSize: 20,
        deps: [filterType, filterPurchaseType],
    });

    const columns: DataTableColumn<Product>[] = [
        {
            key: "product",
            header: "Product Details",
            render: (product) => (
                <div className="flex min-w-[260px] items-center">
                    <div className="h-11 w-11 flex-shrink-0 bg-slate-100 rounded-xl overflow-hidden border border-slate-200/70 shadow-sm">
                        {product.thumbnailURL ? (
                            <img src={product.thumbnailURL} alt="" className="h-full w-full object-cover" />
                        ) : (
                            <div className="h-full w-full flex items-center justify-center text-slate-400">?</div>
                        )}
                    </div>
                    <div className="ml-4 min-w-0">
                        <div className="font-semibold text-slate-900 line-clamp-1 max-w-[260px]">
                            {product.name}
                        </div>
                        <div className="text-slate-500 truncate">/{product.slug}</div>
                    </div>
                </div>
            ),
        },
        {
            key: "type",
            header: "Type",
            render: (product) => <span className="capitalize">{product.type}</span>,
        },
        {
            key: "purchase",
            header: "Purchase",
            render: (product) => product.purchaseType === "subscription" ? (
                <span className="inline-flex items-center rounded-md border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-xs font-semibold text-blue-600">
                    Sub ({product.subscriptionDuration}d)
                </span>
            ) : (
                <span className="text-slate-600">One-time</span>
            ),
        },
        {
            key: "price",
            header: "Price",
            align: "right",
            numeric: true,
            render: (product) => product.price === 0 ? (
                <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">Free</span>
            ) : (
                <span className="font-bold text-slate-900">{formatCurrency(product.price)}</span>
            ),
        },
        {
            key: "status",
            header: "Status",
            render: (product) => (
                <span className={`inline-flex rounded-md border px-2.5 py-0.5 text-xs font-semibold ${product.status === "published"
                    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                    : product.status === "draft"
                        ? "bg-slate-100 text-slate-600 border-slate-200"
                        : "bg-red-500/10 text-red-600 border-red-500/20"
                }`}>
                    {product.status}
                </span>
            ),
        },
        {
            key: "updated",
            header: "Last Updated",
            render: (product) => formatDate(product.updatedAt || product.createdAt),
        },
        {
            key: "actions",
            header: "",
            className: "text-right",
            render: (product) => (
                <Link href={`/products/${product.id}`} className="font-semibold text-primary-600 hover:text-primary-900">
                    Edit
                </Link>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-0">
                <h1 className="text-2xl font-bold text-gray-900">Products</h1>
                <div className="flex items-center gap-2">
                    <Button variant="ghost" onClick={() => downloadProductTemplate()} title="Download product-template.json" leftIcon={<Download className="h-4 w-4" />}>
                        Template
                    </Button>
                    <Link href="/products/create">
                        <Button variant="primary" className="flex items-center gap-2">
                            <span>+ Create Product</span>
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Filters */}
            <Card padding="md" className="flex flex-col sm:flex-row flex-wrap gap-4">
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

            <DataTable
                columns={columns}
                data={products}
                keyExtractor={(product) => product.id}
                isLoading={loading}
                emptyState="No products found matching filters."
                footer={
                    <PaginationControls
                        page={page}
                        pageSize={pageSize}
                        totalItems={total}
                        onPageChange={setPage}
                        onPageSizeChange={setPageSize}
                        itemLabel="products"
                        disabled={loading}
                    />
                }
            />
        </div>
    );
}
