import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getClassByInviteCode, serializeClass } from "@/lib/server/classes";
import { getGroupByInviteCode } from "@/lib/server/sections";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const inv = (searchParams.get("inviteCode") || "").trim();

        if (!inv || inv.length < 3) {
            return NextResponse.json({ class: null, teacher: null });
        }

        // New shape: class invite codes live on `classes/{id}.inviteCode`.
        const classDoc = await getClassByInviteCode(inv);
        if (classDoc) {
            const teacherId = classDoc.teacherId || "";
            // Institute classes (the section) have no owning teacher — teachers
            // are per-subject — so never `.doc("")`. Surface the institute
            // as the owning context instead.
            let teacher: { id: string; profile: any } | null = null;
            if (teacherId) {
                const teacherSnap = await adminDb.collection("teachers").doc(teacherId).get();
                teacher = { id: teacherId, profile: teacherSnap.data()?.profile || {} };
            }
            let institute: { id: string; name: string } | null = null;
            if (classDoc.instituteId) {
                const instSnap = await adminDb
                    .collection("institutes")
                    .doc(String(classDoc.instituteId))
                    .get();
                const inst = instSnap.exists ? instSnap.data() || {} : {};
                institute = {
                    id: String(classDoc.instituteId),
                    name: inst.name || inst.profile?.name || "Institute",
                };
            }
            return NextResponse.json({
                class: serializeClass({ id: classDoc.id, ...classDoc }),
                teacher,
                institute,
            });
        }

        // Group invite codes (GRP-…): joining the group enrolls the student in
        // every class that targets it. Preview the section + its subjects.
        const group = await getGroupByInviteCode(inv);
        if (group) {
            const sectionSnap = await adminDb.collection("sections").doc(group.sectionId).get();
            const section = sectionSnap.exists ? sectionSnap.data() : null;
            const classesSnap = await adminDb
                .collection("classes")
                .where("groupIds", "array-contains", group.id)
                .get();
            const live = classesSnap.docs.map((d) => d.data() || {}).filter((c: any) => !c.isArchived);
            return NextResponse.json({
                class: null,
                teacher: null,
                group: {
                    id: group.id,
                    name: group.name,
                    sectionName: section
                        ? [section.program, section.name].filter(Boolean).join(" · ")
                        : "",
                    classCount: live.length,
                    subjects: live.map((c: any) => c.subject || c.name).filter(Boolean),
                },
            });
        }

        // Legacy fallback: teacher-level invite code on `teachers/{id}`.
        const teacherSnap = await adminDb
            .collection("teachers")
            .where("inviteCode", "==", inv)
            .limit(1)
            .get();
        if (!teacherSnap.empty) {
            const doc = teacherSnap.docs[0];
            const data = doc.data();
            return NextResponse.json({
                class: null,
                teacher: {
                    id: doc.id,
                    profile: data?.profile || {},
                    inviteCode: data?.inviteCode || "",
                },
            });
        }

        return NextResponse.json({ class: null, teacher: null });
    } catch (e: any) {
        console.error("Invite lookup error:", e);
        return NextResponse.json(
            { class: null, teacher: null, error: e.message },
            { status: 500 }
        );
    }
}
