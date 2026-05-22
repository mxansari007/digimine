/**
 * Teacher profile and subscription types
 */

export interface TeacherProfile {
    name: string;
    institute: string;
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
    planId: string;
    status: TeacherSubscriptionStatus;
    startedAt: Date;
    expiresAt: Date;
    gracePeriodEndsAt: Date | null;
    autoRenew: boolean;
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
