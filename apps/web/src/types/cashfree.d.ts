declare module "@cashfreepayments/cashfree-js" {
    interface CashfreeConfig {
        mode: "sandbox" | "production";
    }

    interface CheckoutOptions {
        paymentSessionId: string;
        redirectTarget?: "_self" | "_blank" | "_modal";
    }

    interface CheckoutResult {
        error?: {
            message: string;
            code?: string;
        };
        paymentDetails?: {
            paymentMessage: string;
        };
    }

    interface Cashfree {
        checkout: (options: CheckoutOptions) => Promise<CheckoutResult>;
    }

    export function load(config: CashfreeConfig): Promise<Cashfree>;
}
