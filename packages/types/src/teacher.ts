/**
 * Teacher profile and subscription types
 */

export interface TeacherProfile {
    name: string;
    /** Canonical university/college display name (resolved via the directory). */
    institute: string;
    /**
     * Resolved University directory id (see `university.ts`). `institute`
     * holds the canonical display name; this links to the shared row so
     * sections/classes can be scoped to the same university. Optional for
     * back-compat with profiles created before the directory existed.
     */
    universityId?: string | null;
    phone: string;
    bio: string;
    avatarUrl: string | null;
    subjects: string[];
}

export type TeacherSubscriptionStatus =
    | "active"
    | "grace_period"
    | "expired"
    | "cancelled"
    | "free" | "trial";

export interface TeacherSubscription {
    /**
     * Legacy identifier. Writers now mirror `planCode` into this field —
     * both must be a `code` that exists in the `subscriptionPlans`
     * collection (the entitlements resolver reads planCode first and
     * falls back to planId for older docs).
     */
    planId: string;
    /**
     * Stable plan code matching `subscriptionPlans.code`. Primary key the
     * teachingEntitlements resolver and pricing-page "Current plan" pill
     * use to connect this subscription to an admin-authored plan.
     */
    planCode?: string;
    status: TeacherSubscriptionStatus;
    startedAt: Date;
    expiresAt: Date;
    gracePeriodEndsAt: Date | null;
    autoRenew: boolean;
    /** Billing cadence chosen at purchase/switch. */
    cadence?: "monthly" | "annual";
    /** Snapshot of the plan's monthly price (INR) at grant time. */
    planPrice?: number;
}

export interface TeacherUsage {
    currentStudents: number;
    currentTests: number;
    currentQuizzes: number;
    currentContests: number;
    currentCourses: number;
    currentQuestions: number;
    totalEarnings: number;
    pendingPayout: number;
}

export interface PayoutDetails {
    upiId: string | null;
    bankAccount: BankAccount | null;
    paypalEmail: string | null;
}

export interface BankAccount {
    accountNumber: string;
    ifscCode: string;
    accountHolderName: string;
    bankName: string;
}

export interface Teacher {
    id: string;
    userId: string;
    profile: TeacherProfile;
    subscription: TeacherSubscription | null;
    usage: TeacherUsage;
    payoutDetails: PayoutDetails;
    isVerified: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateTeacherInput {
    userId: string;
    profile: Omit<TeacherProfile, "avatarUrl"> & { avatarUrl?: string | null };
}

export interface UpdateTeacherInput {
    profile?: Partial<TeacherProfile>;
    payoutDetails?: Partial<PayoutDetails>;
}

export interface TeacherStats {
    totalStudents: number;
    totalQuizzes: number;
    totalTests: number;
    totalContests: number;
    totalCourses: number;
}

export interface TeacherFreemiumFields {
    inviteCode: string;
    paymentFingerprint: string | null;
    stats: TeacherStats;
    trialEndsAt?: Date;
    currentPeriodEnd?: Date;
}
