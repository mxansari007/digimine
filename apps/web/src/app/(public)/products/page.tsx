import { getCachedStoreItems } from "@/lib/server/catalog";
import ProductsBrowser from "./ProductsBrowser";

// Server-rendered so every product / test-series card + link is in the initial
// HTML (crawlable). The catalog query is cached (see lib/server/catalog), so
// per-request load stays flat. Per-user badges + review stats hydrate client
// side. Metadata comes from products/layout.tsx.
export default async function ProductsPage({
    searchParams,
}: {
    searchParams?: { type?: string; search?: string };
}) {
    const items = await getCachedStoreItems().catch(() => []);
    const type = searchParams?.type;
    const search = searchParams?.search;

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="container-page py-4 lg:py-8">
                <div className="mb-6 md:mb-8">
                    <h1 className="font-display mb-2 text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">
                        {type ? `${type.charAt(0).toUpperCase() + type.slice(1)}s` : "Study Material & Notes"}
                    </h1>
                    <p className="text-sm text-gray-600 md:text-base">
                        {search
                            ? `Search results for "${search}"`
                            : "Browse study material, notes, topic articles, mock packs, and learning material for exam preparation"}
                    </p>
                </div>

                <ProductsBrowser items={items} initialType={type} initialSearch={search} />
            </div>
        </div>
    );
}
