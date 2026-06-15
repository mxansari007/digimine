import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId } from "@/lib/server/classroomAccess";

export const dynamic = "force-dynamic";

/**
 * GET /api/student/timetable
 * The student's weekly timetable as flat entries — unified across BOTH class
 * models:
 *   • teacher model  — the class IS the subject; `meetings[]` live on the class.
 *   • institute model — the class IS the section; each `subjects/{id}` carries
 *     its own teacher + `meetings[]`.
 * One entry per (class/subject × meeting). Consumed by web + (later) mobile.
 */

type Entry = {
    classId: string;
    subject: string;
    teacherName: string;
    sectionName: string | null;
    room: string | null;
    day: string;
    startTime: string;
    endTime: string;
};

export async function GET(req: Request) {
    const uid = await getBearerUserId(req).catch(() => null);
    if (!uid) return NextResponse.json({ error: "Sign in" }, { status: 401 });

    let snap: FirebaseFirestore.QuerySnapshot;
    try {
        snap = await adminDb
            .collectionGroup("students")
            .where("studentId", "==", uid)
            .where("status", "==", "active")
            .get();
    } catch (e) {
        console.warn("[student/timetable] enrollment query failed:", e);
        return NextResponse.json({ entries: [] });
    }

    const classIds = new Set<string>();
    snap.docs.forEach((d) => {
        const seg = d.ref.path.split("/");
        if (seg[0] === "classes" && seg.length >= 2) classIds.add(seg[1]);
    });

    const entries: Entry[] = [];
    const teacherNameCache = new Map<string, string>();
    async function teacherName(tid: string): Promise<string> {
        if (!tid) return "Teacher";
        const hit = teacherNameCache.get(tid);
        if (hit) return hit;
        const t = await adminDb.collection("teachers").doc(tid).get();
        const nm = (t.exists ? t.data()?.profile?.name : "") || "Teacher";
        teacherNameCache.set(tid, nm);
        return nm;
    }

    for (const classId of classIds) {
        const cs = await adminDb.collection("classes").doc(classId).get();
        if (!cs.exists) continue;
        const c = cs.data() || {};
        if (c.isArchived) continue;

        const classMeetings = Array.isArray(c.meetings) ? c.meetings : [];

        if (classMeetings.length) {
            // Teacher model: one subject (the class), meetings on the class.
            const tn = await teacherName(c.teacherId);
            for (const m of classMeetings) {
                entries.push({
                    classId,
                    subject: c.subject || c.name || "Class",
                    teacherName: tn,
                    sectionName: c.sectionName || null,
                    room: m.room || c.room || null,
                    day: m.day,
                    startTime: m.startTime,
                    endTime: m.endTime,
                });
            }
        } else {
            // Institute model: the class is the section; pull per-subject meetings.
            const subs = await adminDb.collection("classes").doc(classId).collection("subjects").get();
            for (const sd of subs.docs) {
                const s = sd.data() || {};
                const sm = Array.isArray(s.meetings) ? s.meetings : [];
                for (const m of sm) {
                    entries.push({
                        classId,
                        subject: s.name || "Subject",
                        teacherName: s.teacherName || "Teacher",
                        sectionName: c.name || c.sectionName || null,
                        room: m.room || s.room || null,
                        day: m.day,
                        startTime: m.startTime,
                        endTime: m.endTime,
                    });
                }
            }
        }
    }

    return NextResponse.json({ entries });
}
