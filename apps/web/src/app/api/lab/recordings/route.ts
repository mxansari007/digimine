import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireVerifiedUser } from "@/lib/server/classroomAccess";
import {
    LAB_SESSIONS,
    resolveClassLabRole,
    serializeLabRecording,
} from "@/lib/server/labStore";
import { LAB_RECORDINGS } from "@/lib/server/labRecording";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/lab/recordings?classId=... — list a class's recordings, newest
 * first. Visible to any member of the class (teacher or actively-enrolled
 * student); membership is resolved via `resolveClassLabRole`, mirroring the
 * sessions list route. Status is read as-stored (the detail route reconciles +
 * signs a URL on open), so a still-`processing` recording shows up immediately
 * without a per-row egress poll.
 *
 * Each recording is denormalised with its owning session's `title` so the Lab
 * Library can label the row without a second client lookup; the (small) set of
 * distinct session reads is batched rather than one-per-row. Playback URLs are
 * NOT minted here — they're short-lived and only the replay page needs one.
 *
 * Returns: { recordings: (LabRecording & { sessionTitle })[], role: LabRole }
 */
export async function GET(req: Request) {
    try {
        const auth = await requireVerifiedUser(req);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const url = new URL(req.url);
        const classId = (url.searchParams.get("classId") || "").trim();
        if (!classId) {
            return NextResponse.json({ error: "classId is required." }, { status: 400 });
        }

        // Class-membership gate: teacher or enrolled student of this class only.
        const resolved = await resolveClassLabRole(classId, auth.userId);
        if (!resolved) {
            return NextResponse.json(
                { error: "You are not a member of this class." },
                { status: 403 }
            );
        }

        // classId == X, createdAt DESC — covered by the existing composite index.
        const snap = await adminDb
            .collection(LAB_RECORDINGS)
            .where("classId", "==", classId)
            .orderBy("createdAt", "desc")
            .limit(100)
            .get();

        const recordings = snap.docs
            .map((d) => serializeLabRecording(d))
            .filter(Boolean) as NonNullable<ReturnType<typeof serializeLabRecording>>[];

        // Resolve session titles in one batched pass over the distinct sessionIds
        // referenced by the recordings (typically a small set per class).
        const sessionIds = Array.from(
            new Set(recordings.map((r) => r.sessionId).filter(Boolean))
        );
        const titles: Record<string, string> = {};
        if (sessionIds.length > 0) {
            const sessionSnaps = await adminDb.getAll(
                ...sessionIds.map((id) => adminDb.collection(LAB_SESSIONS).doc(id))
            );
            sessionSnaps.forEach((s) => {
                if (s.exists) {
                    const t = s.data()?.title;
                    if (typeof t === "string") titles[s.id] = t;
                }
            });
        }

        const items = recordings.map((r) => ({
            ...r,
            // Fall back gracefully when the session was deleted or has no title.
            sessionTitle: titles[r.sessionId] || "Lab session",
        }));

        return NextResponse.json({ recordings: items, role: resolved.role });
    } catch (error: any) {
        console.error("List lab recordings failed:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to list recordings" },
            { status: 500 }
        );
    }
}
