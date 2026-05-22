/**
 * Institute — the organisation layer above teachers. A coaching centre,
 * college, or training organisation owns one Institute. The institute owns
 * its teachers; the teachers own classes; the classes own students.
 *
 * One institute = one subscription (billed once, covers all the teachers
 * under it). Independent teachers keep working exactly as before — they
 * just don't have an `instituteId` on their teacher doc.
 */

export type InstituteSubscriptionStatus =
    | "trial"
    | "active"
    | "grace_period"
    | "expired"
    | "cancelled";

export interface InstituteSubscription {
    planId: string;
    status: InstituteSubscriptionStatus;
    startedAt: Date;
    expiresAt: Date;
    gracePeriodEndsAt: Date | null;
    seats: number;        // max teachers allowed
    autoRenew: boolean;
}

export interface InstituteStats {
    teacherCount: number;
    activeTeacherCount: number;
    classCount: number;
    studentCount: number;
}

export interface InstituteBranding {
    logoUrl: string | null;
    primaryColor: string | null;        // optional override, hex
    tagline: string | null;
}

export interface Institute {
    id: string;
    name: string;
    slug: string;                       // URL-friendly handle (also a custom-domain candidate)
    description: string | null;
    ownerId: string;                    // user id of the founding admin
    contactEmail: string | null;
    contactPhone: string | null;
    website: string | null;
    address: string | null;
    inviteCode: string;                 // teachers redeem to join
    branding: InstituteBranding;
    subscription: InstituteSubscription | null;
    stats: InstituteStats;
    isArchived: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateInstituteInput {
    name: string;
    description?: string;
    contactEmail?: string;
    contactPhone?: string;
    website?: string;
}

export interface UpdateInstituteInput {
    name?: string;
    description?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    website?: string | null;
    address?: string | null;
    branding?: Partial<InstituteBranding>;
    regenerateInviteCode?: boolean;
}

// ────────────────────────────────────────────────────────────────────
// Admins (people who can manage the institute)
// ────────────────────────────────────────────────────────────────────

export type InstituteAdminRole = "owner" | "admin" | "viewer";

export interface InstituteAdmin {
    userId: string;
    email: string;
    name: string;
    role: InstituteAdminRole;
    addedAt: Date;
    addedBy: string;
}

// ────────────────────────────────────────────────────────────────────
// Teachers under the institute (roster)
// ────────────────────────────────────────────────────────────────────

export type InstituteTeacherStatus = "invited" | "active" | "removed";

export interface InstituteTeacher {
    teacherId: string;        // user id of the teacher (when accepted) or a synthetic id (when invited but not yet signed up)
    email: string;
    name: string | null;
    status: InstituteTeacherStatus;
    invitedAt: Date;
    invitedBy: string;
    joinedAt: Date | null;
    removedAt: Date | null;
}

// ────────────────────────────────────────────────────────────────────
// Shared question bank — owned by the institute, read by all affiliated
// teachers. Pickable inside the existing test/quiz authoring flow.
// ────────────────────────────────────────────────────────────────────

export type QuestionBankItemType = "mcq" | "text_input" | "code";
export type QuestionBankDifficulty = "easy" | "moderate" | "hard";

export interface QuestionBankOption {
    id: string;
    text: string;
    isCorrect?: boolean;
}

export interface QuestionBankItem {
    id: string;
    instituteId: string;
    type: QuestionBankItemType;
    questionText: string;
    options: QuestionBankOption[] | null;
    correctAnswer: string | null;
    explanation: string | null;
    marks: number;
    negativeMarks: number;
    difficulty: QuestionBankDifficulty;
    subject: string | null;        // e.g. "Maths", "Physics"
    topic: string | null;          // e.g. "Trigonometry"
    tags: string[];
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateQuestionBankInput {
    type: QuestionBankItemType;
    questionText: string;
    options?: QuestionBankOption[];
    correctAnswer?: string;
    explanation?: string;
    marks?: number;
    negativeMarks?: number;
    difficulty?: QuestionBankDifficulty;
    subject?: string;
    topic?: string;
    tags?: string[];
}
