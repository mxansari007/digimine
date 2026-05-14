export const FB_PIXEL_ID = "1338291078151612";

export const pageview = () => {
    if (typeof window !== "undefined" && (window as any).fbq) {
        (window as any).fbq("track", "PageView");
    }
};

// https://developers.facebook.com/docs/facebook-pixel/advanced/
export const event = (name: string, options = {}) => {
    if (typeof window !== "undefined" && (window as any).fbq) {
        (window as any).fbq("track", name, options);
    }
};
