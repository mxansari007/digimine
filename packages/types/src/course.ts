export type CourseStatus = "draft" | "published" | "archived";

export type CourseAccessType = "free" | "enrollment_required";

export type CourseDifficulty = "beginner" | "intermediate" | "advanced";

export interface CourseNoteVideo {
    id: string;
    title: string;
    url: string;
    provider: "youtube";
    videoId: string;
}

/**
 * SEO overrides for a single course subtopic. Optional — when blank, the
 * public course page falls back to the subtopic title and summary.
 *
 * Shape intentionally mirrors `ArticleSeo` so the same builder UI can
 * back both surfaces.
 */
export interface CourseSubtopicSeo {
    metaTitle?: string;
    metaDescription?: string;
    canonicalUrl?: string | null;
    ogImageUrl?: string | null;
    focusKeyword?: string | null;
    keywords?: string[];
    structuredDataType?: "Article" | "BlogPosting" | "NewsArticle" | "TechArticle" | "HowTo";
    noIndex?: boolean;
}

export interface CourseNoteSubtopic {
    id: string;
    title: string;
    summary?: string;
    contentHtml: string;
    imageUrls: string[];
    videos: CourseNoteVideo[];
    order?: number;
    /** Optional SEO overrides — applied when the subtopic is rendered standalone. */
    seo?: CourseSubtopicSeo;
}

export interface CourseNoteChapter {
    id: string;
    title: string;
    description?: string;
    subtopics: CourseNoteSubtopic[];
    order?: number;
}

export interface CourseNoteOutlineSubtopic {
    id: string;
    title: string;
    summary?: string;
    hasImages?: boolean;
    videoCount?: number;
    order?: number;
}

export interface CourseNoteOutlineChapter {
    id: string;
    title: string;
    description?: string;
    subtopics: CourseNoteOutlineSubtopic[];
    order?: number;
}

export interface CourseNotesSummary {
    chapterCount: number;
    subtopicCount: number;
    imageCount: number;
    videoCount: number;
}

export interface CourseLinkedQuiz {
    id: string;
    quizId?: string;
    title: string;
    description?: string;
    url?: string;
    status?: "planned" | "published";
}

export interface Course {
    id: string;
    title: string;
    slug: string;
    description: string;
    shortDescription: string;
    thumbnailURL: string | null;
    status: CourseStatus;
    accessType: CourseAccessType;
    price: number;
    compareAtPrice?: number;
    category?: string;
    tags: string[];
    difficulty: CourseDifficulty;
    estimatedHours: number;
    notesOutline: CourseNoteOutlineChapter[];
    notesSummary: CourseNotesSummary;
    linkedTestSeriesIds: string[];
    linkedQuizzes: CourseLinkedQuiz[];
    chapters?: CourseNoteChapter[];
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
}

export interface CourseEnrollment {
    id: string;
    userId: string;
    courseId: string;
    orderId?: string;
    paymentId?: string;
    price?: number;
    status: "pending" | "active" | "revoked";
    enrolledAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateCourseInput {
    title: string;
    slug: string;
    description: string;
    shortDescription: string;
    thumbnailURL?: string | null;
    status?: CourseStatus;
    accessType?: CourseAccessType;
    price?: number;
    compareAtPrice?: number;
    category?: string;
    tags?: string[];
    difficulty?: CourseDifficulty;
    estimatedHours?: number;
    linkedTestSeriesIds?: string[];
    linkedQuizzes?: CourseLinkedQuiz[];
    chapters?: CourseNoteChapter[];
}

export interface UpdateCourseInput extends Partial<CreateCourseInput> {
    id: string;
}
