/**
 * User role types
 */
export type UserRole = "customer" | "admin" | "super_admin" | "teacher" | "institute_admin";

/**
 * Stages of the teacher / institute onboarding wizards. Students skip
 * straight to `"complete"` on signup. The string is namespaced by flow so
 * we can resume the right page even before `role` is committed.
 */
export type OnboardingStep =
    | "teacher:phone"
    | "teacher:payment"
    | "teacher:profile"
    | "institute:phone"
    | "institute:setup"
    | "complete";

/**
 * Purchase record for tracking product access and subscription expiry
 */
export interface PurchaseRecord {
    productId: string;
    purchasedAt: Date;
    expiresAt: Date | null; // null = lifetime access (downloadable), Date = subscription expiry
}

/**
 * Test purchase record
 */
export interface TestPurchaseRecord {
    seriesId: string;
    /** @deprecated Legacy field kept for older user documents. Use seriesId. */
    testId?: string;
    purchasedAt: Date;
    expiresAt: Date | null;
}

/**
 * User profile interface
 */
export interface User {
    id: string;
    email: string;
    displayName: string | null;
    firstName: string | null;
    lastName: string | null;
    phoneNumber: string | null;
    photoURL: string | null;
    /**
     * `null` means the user has not picked a role yet. The web app forces
     * these users through `/auth/role-select` before they can use a dashboard.
     */
    role: UserRole | null;
    /**
     * Where the user is in their role-specific onboarding. `"complete"` (or
     * absent) means they can use the app. Any other value means resume there
     * — the login flow redirects partial-onboarding users back to the right
     * step instead of dropping them on a dashboard with no role committed.
     */
    onboardingStep?: OnboardingStep;
    /**
     * For `institute_admin` users — the institute they own/administer. Written
     * atomically alongside `role` when the institute is created, so route
     * guards can trust it as a strongly-consistent signal that the user has an
     * institute (the `admins` collectionGroup query lags right after creation).
     */
    instituteId?: string;
    // Legacy: string[] for backward compatibility, new: PurchaseRecord[]
    purchasedProducts: string[] | PurchaseRecord[];
    // Test purchases for quick lookup
    purchasedTests: string[] | TestPurchaseRecord[];
    // Normalized test series IDs used by Firestore security rules.
    purchasedTestSeriesIds?: string[];
    createdAt: Date;
    updatedAt: Date;
    // Enrolled classroom teacher IDs (reliable source for dashboard)
    enrolledClassrooms?: string[];
    // ── Public profile (student-editable; shown in classroom threads,
    //    DMs, and the People page) ──────────────────────────────────────
    /** One-line intro, e.g. "Final-year CSE · aiming for SDE roles". */
    headline?: string | null;
    bio?: string | null;
    college?: string | null;
    /** Expected graduation year, e.g. 2027. */
    gradYear?: number | null;
    skills?: string[];
    links?: {
        github?: string | null;
        linkedin?: string | null;
        portfolio?: string | null;
    };
}

/**
 * Helper to check if purchasedProducts is legacy format
 */
export function isLegacyPurchaseFormat(purchases: string[] | PurchaseRecord[]): purchases is string[] {
    if (purchases.length === 0) return true;
    return typeof purchases[0] === "string";
}

/**
 * Helper to get product IDs from purchases (works with both formats)
 */
export function getPurchasedProductIds(purchases: string[] | PurchaseRecord[]): string[] {
    if (isLegacyPurchaseFormat(purchases)) {
        return purchases;
    }
    return purchases.map(p => p.productId);
}

/**
 * Helper to check if user has active access to a product
 */
export function hasActiveAccess(purchases: string[] | PurchaseRecord[], productId: string): boolean {
    if (isLegacyPurchaseFormat(purchases)) {
        return purchases.includes(productId);
    }
    const purchase = purchases.find(p => p.productId === productId);
    if (!purchase) return false;
    // Check if lifetime access or not expired
    if (purchase.expiresAt === null) return true;
    return new Date(purchase.expiresAt) > new Date();
}

/**
 * Helper to check if purchasedTests is legacy string[] format
 */
export function isLegacyTestPurchaseFormat(purchases: string[] | TestPurchaseRecord[]): purchases is string[] {
    if (purchases.length === 0) return true;
    return typeof purchases[0] === 'string';
}

/**
 * Helper to get purchased test series IDs from either stored shape.
 */
export function getPurchasedTestSeriesIds(purchases: string[] | TestPurchaseRecord[]): string[] {
    if (isLegacyTestPurchaseFormat(purchases)) {
        return purchases;
    }
    return purchases.map((purchase) => purchase.seriesId || purchase.testId).filter(Boolean) as string[];
}

/**
 * Helper to check if user has active access to a test series.
 */
export function hasActiveTestAccess(purchases: string[] | TestPurchaseRecord[], seriesId: string): boolean {
    if (isLegacyTestPurchaseFormat(purchases)) {
        return purchases.includes(seriesId);
    }

    const purchase = purchases.find((item) => item.seriesId === seriesId || item.testId === seriesId);
    if (!purchase) return false;
    if (purchase.expiresAt === null) return true;
    return new Date(purchase.expiresAt) > new Date();
}

/**
 * User creation input
 */
export interface CreateUserInput {
    email: string;
    displayName?: string;
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    role?: UserRole;
}

/**
 * User update input
 */
export interface UpdateUserInput {
    displayName?: string;
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    photoURL?: string;
    role?: UserRole;
}
