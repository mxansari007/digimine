"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Script from "next/script";
import { useEffect, useState, Suspense } from "react";

const FB_PIXEL_ID = "1338291078151612";

const FacebookPixelContent = () => {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        // Skip the first tracking since it's handled by the script tag initialization
        if (!isLoaded) {
            setIsLoaded(true);
            return;
        }

        if (typeof window !== "undefined" && (window as any).fbq) {
            (window as any).fbq("track", "PageView");
        }
    }, [pathname, searchParams, isLoaded]);

    return (
        <Script
            id="fb-pixel"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
                __html: `
                    !function(f,b,e,v,n,t,s)
                    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
                    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
                    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
                    n.queue=[];t=b.createElement(e);t.async=!0;
                    t.src=v;s=b.getElementsByTagName(e)[0];
                    s.parentNode.insertBefore(t,s)}(window, document,'script',
                    'https://connect.facebook.net/en_US/fbevents.js');
                    fbq('init', '${FB_PIXEL_ID}');
                    fbq('track', 'PageView');
                `,
            }}
        />
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
                    __html: `<img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${FB_PIXEL_ID}&ev=PageView&noscript=1" alt="" />`,
                }}
            />
        </>
    );
};
