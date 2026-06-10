import type { MetadataRoute } from "next";
import { SITE_NAME } from "@/lib/seo";

/**
 * Web app manifest. Next.js auto-injects `<link rel="manifest">` from this
 * file. Improves SEO + mobile: an installable PWA, a branded toolbar colour,
 * and a richer add-to-home-screen entry for placement-prep students.
 */
export default function manifest(): MetadataRoute.Manifest {
    return {
        name: `${SITE_NAME} — DSA, SQL, mock tests & AI mock interviews`,
        short_name: SITE_NAME,
        description:
            "All-in-one placement prep: DSA & SQL practice, mock tests, live contests, quizzes, courses & AI mock interviews.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#f8fafc",
        theme_color: "#0d9488",
        lang: "en-IN",
        categories: ["education", "productivity"],
        icons: [
            { src: "/logo.png", sizes: "1024x1024", type: "image/png", purpose: "any" },
        ],
    };
}
