/**
 * Fullstack project evaluation types.
 *
 * A teacher defines a project assignment ("evaluation") with free-form
 * scoring parameters; students submit a public GitHub repository; the
 * server fetches the repo, dissects it with the admin-configured LLM
 * provider (DeepSeek by default) and scores each parameter with cited
 * evidence. Scores are AI-suggested reference points for the teacher —
 * the teacher can review/override and must explicitly publish (per
 * student or in bulk) before the student sees any result.
 *
 * Firestore:
 *   projectEvaluations/{autoId}             — the assignment definition
 *   projectSubmissions/{evaluationId_uid}   — one submission per student
 * Both collections are server-only (admin SDK via /api routes; no client
 * SDK reads/writes, no Firestore rules entries).
 */

export type ProjectEvaluationStatus = "draft" | "published" | "closed";

/** Who can see / submit to the evaluation. */
export type ProjectEvalAssignedMode =
    /** Only students enrolled in one of `classIds`. */
    | "classes"
    /** Every student actively enrolled with the teacher (any class). */
    | "all_students";

/** A single teacher-defined scoring parameter ("what I want to see"). */
export interface ProjectEvalParameter {
    /** Stable id (`p1`, `p2`, …) — referenced by submission scores. */
    id: string;
    /** Short label, e.g. "Authentication & security". */
    title: string;
    /**
     * What the teacher expects, in their own words. Fed verbatim to the
     * model, e.g. "Passwords must be hashed; protected routes must check
     * the session server-side."
     */
    description: string;
    /** Maximum score for this parameter (1–100). */
    maxScore: number;
}

export interface ProjectEvaluation {
    id: string;
    title: string;
    /** Project brief / problem statement shown to students and the model. */
    brief: string;
    /** Optional expected tech stack hint, free text ("Next.js + Firebase"). */
    techStack: string | null;
    parameters: ProjectEvalParameter[];
    /** Sum of parameter maxScores — denormalized for list views. */
    maxTotalScore: number;
    /** Creator (teacher uid). */
    teacherId: string;
    /** Institute the creating teacher belongs to, if any. */
    instituteId: string | null;
    assignedMode: ProjectEvalAssignedMode;
    /** Class ids when assignedMode === "classes". */
    classIds: string[];
    status: ProjectEvaluationStatus;
    dueAt: Date | null;
    submissionCount: number;
    evaluatedCount: number;
    createdAt: Date;
    updatedAt: Date;
}

export type ProjectSubmissionStatus =
    | "queued"
    | "processing"
    | "scored"
    | "failed";

export type ProjectParameterVerdict = "met" | "partial" | "not_met";

/** AI score for one teacher parameter, with cited evidence. */
export interface ProjectParameterScore {
    parameterId: string;
    /** Denormalized parameter title at scoring time. */
    title: string;
    score: number;
    maxScore: number;
    verdict: ProjectParameterVerdict;
    confidence: "high" | "medium" | "low";
    /** Why the model gave this score — written for the teacher. */
    reasoning: string;
    /** File-path-cited observations backing the score. */
    evidence: string[];
}

/** Repo-level facts gathered during analysis (not model opinions). */
export interface ProjectRepoMeta {
    fileCount: number;
    totalBytes: number;
    /** Top languages by file extension share. */
    languages: string[];
    detectedStack: string;
    hasReadme: boolean;
    /** Files whose contents were actually read by the model. */
    analyzedFiles: string[];
    /** True when the repo was larger than the analysis budget. */
    truncated: boolean;
    /** Best-effort from the GitHub API; null when unavailable. */
    commitCount: number | null;
    lastCommitAt: Date | null;
    defaultBranch: string | null;
}

/** Model's qualitative read of the whole project. */
export interface ProjectOverview {
    /** 3–5 sentence plain-language summary of what the project is/does. */
    summary: string;
    /** How the code is organized — for a teacher skimming the report. */
    architecture: string;
    strengths: string[];
    improvements: string[];
    /** Suspicious signals (copied boilerplate, dead code, secrets in repo…). */
    redFlags: string[];
}

/** Teacher's manual pass over the AI result. */
export interface ProjectTeacherReview {
    /** Per-parameter overrides; missing keys keep the AI score. */
    adjustedScores: Record<string, number>;
    /** Final total after overrides (server-computed). */
    finalScore: number;
    comment: string;
    reviewedBy: string;
    reviewedAt: Date;
}

export interface ProjectSubmission {
    /** Doc id: `${evaluationId}_${studentId}`. */
    id: string;
    evaluationId: string;
    studentId: string;
    studentName: string;
    studentEmail: string;
    repoUrl: string;
    /** Branch/ref when the student submitted a /tree/<ref> URL. */
    repoRef: string | null;
    status: ProjectSubmissionStatus;
    /** 1-based; resubmissions overwrite results and bump this. */
    attempt: number;
    /** Automatic retries consumed (stuck-processing recovery). */
    retryCount: number;
    repoMeta: ProjectRepoMeta | null;
    overview: ProjectOverview | null;
    scores: ProjectParameterScore[] | null;
    /** Sum of AI scores / sum of maxScores. */
    totalScore: number | null;
    maxTotalScore: number | null;
    error: string | null;
    /**
     * How the `scores` were produced. `"ai"` (or absent, for legacy rows) =
     * the LLM pipeline scored it; `"manual"` = the teacher graded it by hand
     * (the fallback when AI is unavailable / out of allowance). Null while
     * unscored.
     */
    scoredBy: "ai" | "manual" | null;
    teacherReview: ProjectTeacherReview | null;
    /**
     * Whether the teacher has released this result to the student. Scoring
     * (`status: 'scored'`) no longer auto-publishes — the teacher reviews,
     * optionally adjusts marks, then publishes individually or in bulk.
     * Until then the student sees "under review", not the report.
     */
    resultPublished: boolean;
    resultPublishedAt: Date | null;
    submittedAt: Date;
    processingStartedAt: Date | null;
    processedAt: Date | null;
    updatedAt: Date;
}

export const PROJECT_EVAL_LIMITS = {
    /** Max teacher parameters per evaluation. */
    maxParameters: 12,
    minParameters: 1,
    maxParameterScore: 100,
    titleMaxLength: 120,
    briefMaxLength: 6000,
    parameterTitleMaxLength: 120,
    parameterDescriptionMaxLength: 1200,
} as const;
