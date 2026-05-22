import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

type FinalizedStatus = "completed" | "timed_out";

interface InternalRankingEntry {
    id: string;
    userId: string;
    totalScore: number;
    maxPossibleScore: number;
    percentage: number;
    status: FinalizedStatus;
    completedAt: string | null;
    completedAtMillis: number;
    isCurrentUser: boolean;
    rank?: number;
}

function readAuthToken(req: Request): string | null {
    const header = req.headers.get("authorization") || "";
    const match = header.match(/^Bearer\s+(.+)$/i);
    return match?.[1] || null;
}

async function getAuthenticatedUserId(req: Request): Promise<string | null> {
    const token = readAuthToken(req);
    if (!token) return null;
    const decoded = await adminAuth.verifyIdToken(token);
    return decoded.uid;
}

async function isAdminUser(userId: string): Promise<boolean> {
    const userSnap = await adminDb.collection("users").doc(userId).get();
    const role = userSnap.data()?.role;
    return role === "admin" || role === "super_admin";
}

function hasToDate(value: unknown): value is { toDate: () => Date } {
    return typeof value === "object" && value !== null && "toDate" in value && typeof value.toDate === "function";
}

function hasSeconds(value: unknown): value is { seconds?: number; _seconds?: number } {
    return typeof value === "object"
        && value !== null
        && ("seconds" in value || "_seconds" in value);
}

function toMillis(value: unknown): number {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();
    if (typeof value === "string") {
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    if (hasToDate(value)) return value.toDate().getTime();
    if (hasSeconds(value)) {
        const seconds = typeof value.seconds === "number" ? value.seconds : value._seconds;
        return seconds ? seconds * 1000 : 0;
    }
    return 0;
}

function toIsoDate(value: unknown): string | null {
    const millis = toMillis(value);
    return millis > 0 ? new Date(millis).toISOString() : null;
}

function readString(data: Record<string, unknown>, key: string): string {
    const value = data[key];
    return typeof value === "string" ? value : "";
}

function readNumber(data: Record<string, unknown>, key: string): number {
    const value = data[key];
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isFinalizedStatus(status: string): status is FinalizedStatus {
    return status === "completed" || status === "timed_out";
}

function toRankingEntry(id: string, data: Record<string, unknown>, currentUserId: string): InternalRankingEntry | null {
    const status = readString(data, "status");
    const userId = readString(data, "userId");
    if (!userId || !isFinalizedStatus(status)) return null;
    // Exclude preview attempts (teacher / institute admin / platform admin
    // taking the quiz from the public catalog) from the public leaderboard
    // so a teacher running through their own content never appears at #1.
    // The attempting user can still see their own preview attempt because
    // it's surfaced via getUserQuizAttempts, not via ranking.
    if (data.isPreview === true) return null;

    const completedAtMillis = toMillis(data.completedAt) || toMillis(data.updatedAt) || toMillis(data.createdAt);
    return {
        id,
        userId,
        totalScore: readNumber(data, "totalScore"),
        maxPossibleScore: readNumber(data, "maxPossibleScore"),
        percentage: readNumber(data, "percentage"),
        status,
        completedAt: toIsoDate(data.completedAt),
        completedAtMillis,
        isCurrentUser: userId === currentUserId,
    };
}

function publicEntry(entry: InternalRankingEntry) {
    return {
        id: entry.id,
        totalScore: entry.totalScore,
        maxPossibleScore: entry.maxPossibleScore,
        percentage: entry.percentage,
        status: entry.status,
        completedAt: entry.completedAt,
        isCurrentUser: entry.isCurrentUser,
        rank: entry.rank,
    };
}

export async function GET(req: Request) {
    try {
        const authUserId = await getAuthenticatedUserId(req);
        if (!authUserId) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const attemptId = searchParams.get("attemptId");
        if (!attemptId) {
            return NextResponse.json({ error: "Missing attemptId" }, { status: 400 });
        }

        const selectedAttemptSnap = await adminDb.collection("quizAttempts").doc(attemptId).get();
        if (!selectedAttemptSnap.exists) {
            return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
        }

        const selectedAttemptData = selectedAttemptSnap.data() as Record<string, unknown>;
        const currentUserId = readString(selectedAttemptData, "userId");
        const canRead = currentUserId === authUserId || await isAdminUser(authUserId);
        if (!canRead) {
            return NextResponse.json({ error: "You cannot view ranking for this attempt" }, { status: 403 });
        }

        const selectedStatus = readString(selectedAttemptData, "status");
        if (!isFinalizedStatus(selectedStatus)) {
            return NextResponse.json({ error: "Ranking is available after the quiz is submitted" }, { status: 409 });
        }

        const quizId = readString(selectedAttemptData, "quizId");
        const contestId = readString(selectedAttemptData, "contestId");
        if (!quizId || !currentUserId) {
            return NextResponse.json({ error: "Attempt is missing ranking fields" }, { status: 400 });
        }

        let contestIsFinal = false;
        let leaderboardAvailableAt: string | null = null;
        if (contestId) {
            const contestSnap = await adminDb.collection("contests").doc(contestId).get();
            const contestData = contestSnap.data() as Record<string, unknown> | undefined;
            const endTimeMillis = toMillis(contestData?.endTime);
            contestIsFinal = endTimeMillis > 0 && Date.now() >= endTimeMillis;
            leaderboardAvailableAt = toIsoDate(contestData?.endTime);
        }

        const attemptsQuery = contestId
            ? adminDb.collection("quizAttempts").where("contestId", "==", contestId)
            : adminDb.collection("quizAttempts").where("quizId", "==", quizId);
        const attemptsSnap = await attemptsQuery.get();

        const latestByUser = new Map<string, InternalRankingEntry>();
        attemptsSnap.docs.forEach((docSnap) => {
            const data = docSnap.data() as Record<string, unknown>;
            if (contestId && readString(data, "contestId") !== contestId) return;
            const entry = toRankingEntry(docSnap.id, data, currentUserId);
            if (!entry) return;

            const existing = latestByUser.get(entry.userId);
            if (!existing || entry.completedAtMillis > existing.completedAtMillis) {
                latestByUser.set(entry.userId, entry);
            }
        });

        let previousScore: number | null = null;
        let previousRank = 0;
        const rankedEntries = Array.from(latestByUser.values())
            .sort((a, b) => {
                const scoreDiff = b.totalScore - a.totalScore;
                if (scoreDiff !== 0) return scoreDiff;
                const percentDiff = b.percentage - a.percentage;
                if (percentDiff !== 0) return percentDiff;
                return a.completedAtMillis - b.completedAtMillis;
            })
            .map((entry, index) => {
                const rank = previousScore === entry.totalScore ? previousRank : index + 1;
                previousScore = entry.totalScore;
                previousRank = rank;
                return { ...entry, rank };
            });

        const currentRankedEntry = rankedEntries.find((entry) => entry.isCurrentUser);
        const totalParticipants = rankedEntries.length;
        const belowCurrent = currentRankedEntry
            ? rankedEntries.filter((entry) => entry.totalScore < currentRankedEntry.totalScore).length
            : 0;
        const percentile = totalParticipants > 1
            ? Math.round((belowCurrent / (totalParticipants - 1)) * 100)
            : 100;
        const averageScore = totalParticipants > 0
            ? Math.round((rankedEntries.reduce((sum, entry) => sum + entry.totalScore, 0) / totalParticipants) * 100) / 100
            : 0;

        return NextResponse.json({
            entries: rankedEntries.map(publicEntry),
            totalParticipants,
            userRank: currentRankedEntry?.rank || null,
            percentile,
            topScore: rankedEntries[0]?.totalScore || 0,
            averageScore,
            rankedAttemptId: currentRankedEntry?.id || null,
            rankedAttemptCompletedAt: currentRankedEntry?.completedAt || null,
            selectedAttemptId: attemptId,
            selectedAttemptIsRanked: currentRankedEntry?.id === attemptId,
            scope: contestId ? "contest" : "quiz",
            contestId: contestId || null,
            isFinal: contestId ? contestIsFinal : true,
            leaderboardAvailableAt,
        });
    } catch (error: unknown) {
        console.error("Failed to load quiz ranking:", error);
        const message = error instanceof Error ? error.message : "Failed to load ranking data";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
