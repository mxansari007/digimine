export const FB_PIXEL_ID = "1338291078151612";

// ─── Core helpers ───────────────────────────────────────────────────────────

export const pageview = () => {
    if (typeof window !== "undefined" && (window as any).fbq) {
        (window as any).fbq("track", "PageView");
    }
};

// https://developers.facebook.com/docs/facebook-pixel/advanced/
export const event = (name: string, options: Record<string, any> = {}) => {
    if (typeof window !== "undefined" && (window as any).fbq) {
        (window as any).fbq("track", name, options);
    }
};

// Custom events use 'trackCustom' instead of 'track'
export const customEvent = (name: string, options: Record<string, any> = {}) => {
    if (typeof window !== "undefined" && (window as any).fbq) {
        (window as any).fbq("trackCustom", name, options);
    }
};

// ─── Standard events ────────────────────────────────────────────────────────

export const viewContent = (product: {
    id: string;
    name: string;
    category?: string;
    price: number;
    currency?: string;
}) => {
    event("ViewContent", {
        content_type: "product",
        content_ids: [product.id],
        content_name: product.name,
        content_category: product.category,
        value: product.price,
        currency: product.currency || "INR",
    });
};

export const addToCart = (product: {
    id: string;
    name: string;
    category?: string;
    price: number;
    quantity?: number;
    currency?: string;
}) => {
    event("AddToCart", {
        content_type: "product",
        content_ids: [product.id],
        content_name: product.name,
        content_category: product.category,
        value: product.price * (product.quantity ?? 1),
        currency: product.currency || "INR",
        num_items: product.quantity ?? 1,
    });
};

export const trackSearch = (query: string, resultsCount: number) => {
    event("Search", {
        search_string: query,
        num_results: resultsCount,
    });
};

export const initiateCheckout = (params: {
    value: number;
    currency?: string;
    contentIds?: string[];
    numItems?: number;
}) => {
    event("InitiateCheckout", {
        value: params.value,
        currency: params.currency || "INR",
        content_ids: params.contentIds,
        num_items: params.numItems ?? 1,
    });
};

export const addPaymentInfo = (params: {
    value: number;
    currency?: string;
    contentIds?: string[];
}) => {
    event("AddPaymentInfo", {
        value: params.value,
        currency: params.currency || "INR",
        content_ids: params.contentIds,
    });
};

export const purchase = (order: {
    id: string;
    value: number;
    currency?: string;
    contents: Array<{ id: string; name: string; quantity: number; item_price: number }>;
}) => {
    event("Purchase", {
        content_type: "product",
        contents: order.contents,
        content_ids: order.contents.map((c) => c.id),
        value: order.value,
        currency: order.currency || "INR",
        num_items: order.contents.reduce((sum, c) => sum + c.quantity, 0),
    });
};

export const completeRegistration = (registrationMethod: string) => {
    event("CompleteRegistration", {
        status: true,
        registration_method: registrationMethod,
    });
};

export const contact = () => {
    event("Contact");
};

export const addToWishlist = (product: {
    id: string;
    name: string;
    category?: string;
    price: number;
    currency?: string;
}) => {
    event("AddToWishlist", {
        content_type: "product",
        content_ids: [product.id],
        content_name: product.name,
        content_category: product.category,
        value: product.price,
        currency: product.currency || "INR",
    });
};

export const lead = (params: { value?: number; currency?: string; contentName?: string } = {}) => {
    event("Lead", {
        value: params.value,
        currency: params.currency || "INR",
        content_name: params.contentName,
    });
};

export const subscribe = (params: { value?: number; currency?: string; predictedLtv?: number } = {}) => {
    event("Subscribe", {
        value: params.value,
        currency: params.currency || "INR",
        predicted_ltv: params.predictedLtv,
    });
};

export const startTrial = (params: { value?: number; currency?: string; predictedLtv?: number } = {}) => {
    event("StartTrial", {
        value: params.value,
        currency: params.currency || "INR",
        predicted_ltv: params.predictedLtv,
    });
};

export const findLocation = () => {
    event("FindLocation");
};

export const schedule = () => {
    event("Schedule");
};

export const customizeProduct = (product: { id: string; name: string }) => {
    event("CustomizeProduct", {
        content_ids: [product.id],
        content_name: product.name,
    });
};

export const submitApplication = () => {
    event("SubmitApplication");
};

export const donate = (params: { value?: number; currency?: string } = {}) => {
    event("Donate", {
        value: params.value,
        currency: params.currency || "INR",
    });
};

// ─── Custom events (trackCustom) ────────────────────────────────────────────

export const shareProduct = (product: { id: string; name: string; method?: string }) => {
    customEvent("ShareProduct", {
        content_ids: [product.id],
        content_name: product.name,
        share_method: product.method,
    });
};

export const productReview = (product: { id: string; name: string; rating: number }) => {
    customEvent("ProductReview", {
        content_ids: [product.id],
        content_name: product.name,
        rating: product.rating,
    });
};

export const fileDownload = (params: { fileName: string; productId: string; productName: string }) => {
    customEvent("FileDownload", {
        file_name: params.fileName,
        content_ids: [params.productId],
        content_name: params.productName,
    });
};

export const viewFAQ = (question: string) => {
    customEvent("ViewFAQ", {
        question,
    });
};

export const signIn = (method: string) => {
    customEvent("SignIn", {
        method,
    });
};

export const pageScroll = (params: { depth: number; pagePath: string }) => {
    customEvent("PageScroll", {
        scroll_depth: params.depth,
        page_path: params.pagePath,
    });
};

export const timeOnPage = (params: { seconds: number; pagePath: string }) => {
    customEvent("TimeOnPage", {
        time_seconds: params.seconds,
        page_path: params.pagePath,
    });
};
