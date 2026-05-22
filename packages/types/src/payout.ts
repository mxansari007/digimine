/**
 * Teacher payout types
 */

export type PayoutStatus = "pending" | "processing" | "completed" | "failed";
export type PayoutMethod = "upi" | "bank_transfer" | "paypal";

export interface Payout {
    id: string;
    teacherId: string;
    amount: number;
    status: PayoutStatus;
    method: PayoutMethod;
    initiatedAt: Date;
    completedAt: Date | null;
    transactionId: string | null;
    adminNotes: string | null;
}

export interface CreatePayoutInput {
    teacherId: string;
    amount: number;
    method: PayoutMethod;
}
