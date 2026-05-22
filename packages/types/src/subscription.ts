/**
 * Subscription plan types
 */

export interface PlanLimits {
    maxStudents: number;
    maxTests: number;
    maxQuizzes: number;
    maxContests: number;
    maxCourses: number;
    maxQuestions: number;
    pistonConcurrency: number;
}

export interface SubscriptionPlan {
    id: string;
    name: string;
    priceINR: number;
    priceUSD: number;
    limits: PlanLimits;
    features: string[];
    description?: string;
}

export type PlanId = "starter" | "pro" | "institution" | "free";
