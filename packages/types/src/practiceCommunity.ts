/**
 * Practice community layer — per-problem Discussions and Solutions, plus the
 * public profile view. Built on top of the practice module.
 *
 * Collections:
 *   practiceDiscussions       — discussion threads (rich body) per problem
 *   practiceDiscussionReplies — flat replies on a thread
 *   practiceSolutions         — published solution write-ups (article-like)
 *   practiceVotes             — one doc per (user, target) to dedupe upvotes
 */

import { stripArticleHtml } from "./article";

/** Denormalized author snapshot stored on each post (kept cheap to render). */
export interface CommunityAuthor {
    userId: string;
    name: string;
    avatarUrl: string | null;
}

export type VoteTargetType = "discussion" | "solution" | "reply";

export interface PracticeDiscussion {
    id: string;
    problemId: string;
    problemSlug: string;
    author: CommunityAuthor;
    title: string;
    bodyHtml: string;
    /** Optional free-text tags ("hint", "tle", "interview"). */
    tags: string[];
    upvotes: number;
    replyCount: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface PracticeReply {
    id: string;
    discussionId: string;
    problemId: string;
    author: CommunityAuthor;
    bodyHtml: string;
    upvotes: number;
    createdAt: Date;
}

export interface PracticeSolution {
    id: string;
    problemId: string;
    problemSlug: string;
    author: CommunityAuthor;
    title: string;
    /** Rich, article-like write-up (RichTextEditor HTML). */
    bodyHtml: string;
    /** Language of the accompanying code, e.g. "python". */
    language: string;
    /** Optional Big-O annotations. */
    timeComplexity: string | null;
    spaceComplexity: string | null;
    tags: string[];
    upvotes: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateDiscussionInput {
    problemId: string;
    title: string;
    bodyHtml: string;
    tags?: string[];
}

export interface CreateReplyInput {
    bodyHtml: string;
}

export interface CreateSolutionInput {
    problemId: string;
    title: string;
    bodyHtml: string;
    language?: string;
    timeComplexity?: string | null;
    spaceComplexity?: string | null;
    tags?: string[];
}

/** Public profile view — safe subset of the user + their practice footprint. */
export interface PublicProfile {
    userId: string;
    name: string;
    avatarUrl: string | null;
    bio: string | null;
    joinedAt: string | null;
    stats: {
        solved: number;
        easy: number;
        medium: number;
        hard: number;
        currentStreak: number;
        longestStreak: number;
        solutionsPosted: number;
        discussionsStarted: number;
    };
}

export type CommunitySort = "top" | "newest";

/** Short plain-text preview for list rows. */
export function communityExcerpt(html: string, max = 180): string {
    const text = stripArticleHtml(html || "");
    if (text.length <= max) return text;
    return text.slice(0, max).replace(/\s+\S*$/, "") + "…";
}
