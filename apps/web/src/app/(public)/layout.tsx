import { Header, Footer } from "@/components/layout";
import { getMegaNavItems } from "@/lib/server/megaNavConfig";

/**
 * Public layout. Fetches the admin-edited mega-nav config server-side so
 * the header renders with the right items in the initial HTML (no client
 * flash, no extra round-trip). Reads go through a Redis-cached helper —
 * shared across the fleet, ~1ms per page after the first miss.
 */
export default async function PublicLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const megaNavItems = await getMegaNavItems();
    return (
        <div className="min-h-screen flex flex-col">
            <Header megaNavItems={megaNavItems} />
            <main className="flex-1">{children}</main>
            <Footer />
        </div>
    );
}
