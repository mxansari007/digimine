import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { resolveClassMember } from "@/lib/server/classCommunity";

export const dynamic = "force-dynamic";

/**
 * Who's in this class — the teacher plus active students, with public
 * profile bits for the People page. Members only.
 */
export async function GET(req: Request, { params }: { params: { classId: string } }) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        const member = await resolveClassMember(params.classId, userId || "");
        if (!member.ok) {
            return NextResponse.json({ error: member.error }, { status: member.status });
        }

        const teacherId = member.classDoc.teacherId || "";
        const [teacherSnap, studentsSnap] = await Promise.all([
            teacherId ? adminDb.collection("teachers").doc(teacherId).get() : null,
            adminDb
                .collection("classes")
                .doc(params.classId)
                .collection("students")
                .where("status", "==", "active")
                .get(),
        ]);

        const studentIds = studentsSnap.docs.map((d) => d.id);
        const userDocs = await Promise.all(
            studentIds.map((id) => adminDb.collection("users").doc(id).get())
        );
        // Block state is only meaningful to (and visible by) moderators.
        const isModerator = member.role !== "student";
        const students = studentsSnap.docs.map((d, i) => {
            const roster = d.data() || {};
            const profile = userDocs[i].exists ? userDocs[i].data() || {} : {};
            const cb = roster.communityBlock || {};
            return {
                id: d.id,
                role: "student" as const,
                name:
                    profile.displayName ||
                    roster.studentName ||
                    `${profile.firstName || ""} ${profile.lastName || ""}`.trim() ||
                    "Student",
                avatarUrl: profile.photoURL || null,
                headline: profile.headline || null,
                college: profile.college || null,
                gradYear: profile.gradYear || null,
                skills: Array.isArray(profile.skills) ? profile.skills.slice(0, 8) : [],
                block: isModerator
                    ? { threads: Boolean(cb.threads), dm: Boolean(cb.dm) }
                    : undefined,
            };
        });

        const teacherData = teacherSnap?.exists ? teacherSnap.data() || {} : {};
        const teacher = teacherId
            ? {
                  id: teacherId,
                  role: "teacher" as const,
                  name: teacherData.profile?.name || "Teacher",
                  avatarUrl: teacherData.profile?.avatarUrl || null,
                  headline: teacherData.profile?.bio?.slice(0, 120) || null,
                  college: teacherData.profile?.institute || null,
                  gradYear: null,
                  skills: Array.isArray(teacherData.profile?.subjects)
                      ? teacherData.profile.subjects.slice(0, 8)
                      : [],
              }
            : null;

        return NextResponse.json({
            me: member.userId,
            viewerRole: member.role,
            members: [
                ...(teacher ? [teacher] : []),
                ...students.sort((a, b) => a.name.localeCompare(b.name)),
            ],
        });
    } catch (error: any) {
        console.error("List class members failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
