import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
    const origin = siteOrigin();
    return {
        rules: [
            {
                userAgent: "*",
                allow: "/",
                // Private / app-only surfaces — block from search results.
                disallow: [
                    "/admin",
                    "/api/",
                    "/auth/",
                    "/dashboard/",
                    "/teacher/",
                    "/institute/",
                    "/classroom/",
                    "/join/",
                    "/checkout",
                    "/success",
                ],
            },
            {
                // GPTBot et al. are noisy and don't drive traffic — opt out by
                // default. Remove this block if you change your mind later.
                userAgent: ["GPTBot", "CCBot", "Google-Extended"],
                disallow: ["/"],
            },
        ],
        sitemap: `${origin}/sitemap.xml`,
        host: origin,
    };
}
