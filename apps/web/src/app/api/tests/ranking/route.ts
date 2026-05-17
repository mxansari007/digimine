import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

type FinalizedStatus = "completed" | "timed_out";

interface InternalRankingEntry {
    id: string;
    userId: string;
    displayName?: string;
    email?: string;
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

function toRankingEntry(id: string, data: Record<string, unknown>, currentAttemptUserId: string): InternalRankingEntry | null {
    const status = readString(data, "status");
    const userId = readString(data, "userId");
    if (!userId || !isFinalizedStatus(status)) return null;

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
        isCurrentUser: userId === currentAttemptUserId,
    };
}

function publicEntry(entry: InternalRankingEntry) {
    return {
        id: entry.id,
        userId: entry.userId,
        displayName: entry.displayName || null,
        email: entry.email || null,
        totalScore: entry.totalScore,
        maxPossibleScore: entry.maxPossibleScore,
        percentage: entry.percentage,
        status: entry.status,
        completedAt: entry.completedAt,
        isCurrentUser: entry.isCurrentUser,
        rank: entry.rank,
    };
}

async function loadUserSummaries(userIds: string[]) {
    const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
    const entries = await Promise.all(
        uniqueUserIds.map(async (userId) => {
            try {
                const snap = await adminDb.collection("users").doc(userId).get();
                const data = snap.data() || {};
                const displayName = typeof data.displayName === "string" && data.displayName.trim()
                    ? data.displayName.trim()
                    : typeof data.name === "string" && data.name.trim()
                        ? data.name.trim()
                        : typeof data.email === "string" && data.email.trim()
                            ? data.email.trim()
                            : `Participant ${userId.slice(0, 6)}`;
                const email = typeof data.email === "string" ? data.email : "";
                return [userId, { displayName, email }] as const;
            } catch {
                return [userId, { displayName: `Participant ${userId.slice(0, 6)}`, email: "" }] as const;
            }
        })
    );
    return new Map(entries);
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

        const currentAttemptSnap = await adminDb.collection("testAttempts").doc(attemptId).get();
        if (!currentAttemptSnap.exists) {
            return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
        }

        const currentAttemptData = currentAttemptSnap.data() as Record<string, unknown>;
        const currentAttemptUserId = readString(currentAttemptData, "userId");
        const canRead = currentAttemptUserId === authUserId || await isAdminUser(authUserId);
        if (!canRead) {
            return NextResponse.json({ error: "You cannot view ranking for this attempt" }, { status: 403 });
        }

        const currentStatus = readString(currentAttemptData, "status");
        if (!isFinalizedStatus(currentStatus)) {
            return NextResponse.json({ error: "Ranking is available after the test is submitted" }, { status: 409 });
        }

        const testId = readString(currentAttemptData, "testId");
        const seriesId = readString(currentAttemptData, "seriesId");
        const contestId = readString(currentAttemptData, "contestId");
        if (!testId || !seriesId || !currentAttemptUserId) {
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
            ? adminDb.collection("testAttempts").where("contestId", "==", contestId)
            : adminDb.collection("testAttempts").where("testId", "==", testId);
        const attemptsSnap = await attemptsQuery.get();

        const latestByUser = new Map<string, InternalRankingEntry>();
        attemptsSnap.docs.forEach((docSnap) => {
            const data = docSnap.data() as Record<string, unknown>;
            if (readString(data, "seriesId") !== seriesId) return;
            if (contestId && readString(data, "contestId") !== contestId) return;

            const entry = toRankingEntry(docSnap.id, data, currentAttemptUserId);
            if (!entry || entry.userId === currentAttemptUserId) return;

            const existing = latestByUser.get(entry.userId);
            if (!existing || entry.completedAtMillis > existing.completedAtMillis) {
                latestByUser.set(entry.userId, entry);
            }
        });

        const currentEntry = toRankingEntry(attemptId, currentAttemptData, currentAttemptUserId);
        if (currentEntry) {
            latestByUser.set(currentAttemptUserId, currentEntry);
        }

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

        const userSummaries = await loadUserSummaries(rankedEntries.map((entry) => entry.userId));
        const decoratedEntries = rankedEntries.map((entry) => {
            const summary = userSummaries.get(entry.userId);
            return {
                ...entry,
                displayName: summary?.displayName,
                email: summary?.email,
            };
        });

        const currentRankedEntry = decoratedEntries.find((entry) => entry.isCurrentUser);
        const totalParticipants = decoratedEntries.length;
        const belowCurrent = currentRankedEntry
            ? decoratedEntries.filter((entry) => entry.totalScore < currentRankedEntry.totalScore).length
            : 0;
        const percentile = totalParticipants > 1
            ? Math.round((belowCurrent / (totalParticipants - 1)) * 100)
            : 100;
        const averageScore = totalParticipants > 0
            ? Math.round((decoratedEntries.reduce((sum, entry) => sum + entry.totalScore, 0) / totalParticipants) * 100) / 100
            : 0;

        return NextResponse.json({
            entries: decoratedEntries.map(publicEntry),
            totalParticipants,
            userRank: currentRankedEntry?.rank || null,
            percentile,
            topScore: decoratedEntries[0]?.totalScore || 0,
            averageScore,
            scope: contestId ? "contest" : "test",
            contestId: contestId || null,
            isFinal: contestId ? contestIsFinal : true,
            leaderboardAvailableAt,
        });
    } catch (error: unknown) {
        console.error("Failed to load test ranking:", error);
        const message = error instanceof Error ? error.message : "Failed to load ranking data";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
