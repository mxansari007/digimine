/**
 * Teacher content visibility and marketplace metadata
 */

export type ContentVisibility =
    | "private"
    | "submitted_for_review"
    | "published"
    | "rejected";

export type ContentContext = "public" | "teacher_classroom";

export interface TeacherContentMetadata {
    teacherId: string | null;
    /**
     * When set, this content is authored by an institute (the field carries
     * the institute id). Institute-authored content can target multiple
     * classes at once via `classIds`. Affiliated teachers can still author
     * their own content with `teacherId` only.
     */
    instituteId?: string | null;
    /**
     * Classes that this piece of content is assigned to. A teacher can
     * publish one quiz/test/contest/course to multiple classes; only
     * students enrolled in one of these classes can see it. Empty array
     * (or undefined on legacy docs) means the content is not yet assigned
     * to any class — visible only to the teacher.
     */
    classIds?: string[];
    visibility: ContentVisibility;
    context: ContentContext;
    reviewNotes: string | null;
    suggestedPrice: number | null;
    finalPrice: number | null;
    salesCount: number;
    revenueGenerated: number;
    teacherEarnings: number;
    submittedForReviewAt: Date | null;
    reviewedBy: string | null;
    reviewedAt: Date | null;
    isFeatured: boolean;
}

export interface PublicContent {
    id: string;
    originalContentId: string;
    contentType: "quiz" | "test" | "course" | "contest";
    originalTeacherId: string;
    teacherName: string;
    title: string;
    description: string;
    thumbnailUrl: string | null;
    finalPrice: number;
    revenueShare: number; // e.g. 0.70
    salesCount: number;
    revenueGenerated: number;
    teacherEarnings: number;
    isFeatured: boolean;
    createdAt: Date;
    updatedAt: Date;
}
