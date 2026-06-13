import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import {
    DM_THREADS,
    classIdsFor,
    getUserIdentity,
    serializeDmThread,
} from "@/lib/server/classCommunity";
import { getClassById } from "@/lib/server/classes";
import { createNotification } from "@/lib/server/notifications";

export const dynamic = "force-dynamic";

export const COMMUNITY_REPORTS = "communityReports";

type Params = { params: { threadId: string } };

/**
 * Report the other participant of a DM to the teacher(s) of the class(es)
 * the two of you share. Writes a `communityReports` doc (the teacher/admin
 * dashboard surfaces these) and notifies each relevant teacher.
 * Body: { reason, details? }.
 */
export async function POST(req: Request, { params }: Params) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

        const ref = adminDb.collection(DM_THREADS).doc(params.threadId);
        const snap = await ref.get();
        const data = snap.exists ? snap.data() || {} : null;
        if (!data || !Array.isArray(data.participantIds) || !data.participantIds.includes(userId)) {
            return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
        }
        const otherId = data.participantIds.find((id: string) => id !== userId) || "";
        if (!otherId) return NextResponse.json({ error: "Nothing to report." }, { status: 400 });

        const body = await req.json().catch(() => ({}));
        const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 80) : "";
        const details = typeof body.details === "string" ? body.details.trim().slice(0, 1000) : "";
        if (!reason) return NextResponse.json({ error: "Pick a reason." }, { status: 400 });

        // Teachers of the shared class(es) are the recipients. (Reporter and
        // reported always share ≥1 class — that's how the DM was allowed.)
        const [reporterClasses, reportedClasses, reporter, reported] = await Promise.all([
            classIdsFor(userId),
            classIdsFor(otherId),
            getUserIdentity(userId),
            getUserIdentity(otherId),
        ]);
        const sharedClassIds = [...reporterClasses].filter((id) => reportedClasses.has(id));
        const classDocs = await Promise.all(sharedClassIds.map((id) => getClassById(id)));
        const teacherByClass = new Map<string, string>();
        classDocs.forEach((c, i) => {
            if (c?.teacherId) teacherByClass.set(sharedClassIds[i], c.teacherId);
        });

        const now = Timestamp.now();
        // Capture the last message as lightweight context for the teacher.
        const lastMsgSnap = await ref
            .collection("messages")
            .orderBy("createdAt", "desc")
            .limit(1)
            .get()
            .catch(() => null);
        const lastMessageText = lastMsgSnap?.docs[0]?.data()?.text?.slice(0, 200) || "";

        const reportRef = adminDb.collection(COMMUNITY_REPORTS).doc();
        await reportRef.set({
            context: "dm",
            threadId: params.threadId,
            reporterId: userId,
            reporterName: reporter.name,
            reportedUserId: otherId,
            reportedName: reported.name,
            reason,
            details,
            classIds: sharedClassIds,
            teacherIds: Array.from(new Set([...teacherByClass.values()])),
            lastMessageText,
            status: "open",
            createdAt: now,
        });

        // One notification per distinct teacher.
        await Promise.all(
            Array.from(new Set([...teacherByClass.values()])).map((teacherId) =>
                createNotification(teacherId, {
                    type: "report",
                    title: `${reporter.name} reported ${reported.name}`,
                    body: `Reason: ${reason}. Review the conversation in your class community.`,
                    data: { reportId: reportRef.id, reportedUserId: otherId, kind: "report" },
                    actorId: userId,
                    actorName: reporter.name,
                })
            )
        );

        return NextResponse.json({ ok: true, conversation: serializeDmThread(snap, userId) });
    } catch (error: any) {
        console.error("Report user failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
