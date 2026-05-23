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
            {/*
              Loaded with `lazyOnload` so the pixel doesn't compete with the
              hydration of the page for main-thread time. PageView fires once
              the pixel reports loaded via onLoad — the useEffect above also
              re-fires on every client-side navigation.
            */}
            <Script
                id="fb-pixel"
                src="/scripts/pixel.js"
                strategy="lazyOnload"
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
