"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Script from "next/script";
import { useEffect, useState, Suspense } from "react";
import * as pixel from "@/lib/fpixel";

const FacebookPixelContent = () => {
    const [loaded, setLoaded] = useState(false);
    const pathname = usePathname();
    const searchParams = useSearchParams();

    useEffect(() => {
        if (!loaded) return;

        pixel.pageview();
    }, [pathname, searchParams, loaded]);

    return (
        <div>
            <Script
                id="fb-pixel"
                src="/scripts/pixel.js"
                strategy="afterInteractive"
                onLoad={() => setLoaded(true)}
                data-pixel-id={pixel.FB_PIXEL_ID}
            />
        </div>
    );
};

export const FacebookPixel = () => {
    return (
        <>
            <Suspense fallback={null}>
                <FacebookPixelContent />
            </Suspense>
            <noscript
                dangerouslySetInnerHTML={{
                    __html: `<img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${pixel.FB_PIXEL_ID}&ev=PageView&noscript=1" alt="" />`,
                }}
            />
        </>
    );
};
