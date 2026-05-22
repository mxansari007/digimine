import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
    title: "Digital products — downloads, eBooks, templates",
    description:
        "Downloadable digital products curated by PlacementRanker — eBooks, templates, study material, and more.",
    path: "/products",
    keywords: ["digital products", "eBooks", "templates", "downloads", "study material"],
});

export default function ProductsLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
