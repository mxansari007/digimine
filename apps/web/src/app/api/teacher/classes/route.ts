import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import {
    allocateUniqueInviteCode,
    listTeacherClasses,
    serializeClass,
} from "@/lib/server/classes";
import { resolveOrCreateUniversity } from "@/lib/server/universities";
import { normalizeUniversityName } from "@digimine/utils";
import {
    getSectionById,
    materializeClassRosterFromGroups,
    resolveGroups,
    resolveOrCreateSection,
    sanitizeMeetings,
} from "@/lib/server/sections";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }
        const classes = await listTeacherClasses(userId);
        return NextResponse.json({
            classes: classes.map((c) => serializeClass(c)),
        });
    } catch (error: any) {
        console.error("List classes failed:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to list classes" },
            { status: 500 }
        );
    }
}

function positiveIntOrNull(v: any): number | null {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

export async function POST(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }
        const body = await req.json().catch(() => ({}));
        const description = typeof body.description === "string" ? body.description.trim() : "";
        // Per-class opt-in to the Virtual Lab (teacher decides at creation).
        const labEnabled = body.labEnabled === true;

        // Institute-affiliated teachers can't create classes themselves — the
        // institute owns class creation and assigns teachers.
        const teacherSnap = await adminDb.collection("teachers").doc(userId).get();
        const teacherData = teacherSnap.exists ? teacherSnap.data() || {} : {};
        if (teacherData.instituteId) {
            return NextResponse.json(
                {
                    error: "You're affiliated with an institute — classes are created and assigned by the institute admin.",
                },
                { status: 403 }
            );
        }

        const subject = typeof body.subject === "string" ? body.subject.trim() : "";
        const wantsSection =
            Boolean(body.sectionId) ||
            Boolean(body.section && typeof body.section?.name === "string" && body.section.name.trim());
        const isNewShape =
            Boolean(subject) ||
            wantsSection ||
            Array.isArray(body.meetings) ||
            Array.isArray(body.groupIds) ||
            Array.isArray(body.groups);

        // ─── Legacy shape: plain { name, description } class ───────────────
        if (!isNewShape) {
            const name = typeof body.name === "string" ? body.name.trim() : "";
            if (!name) {
                return NextResponse.json({ error: "Class name is required." }, { status: 400 });
            }
            if (name.length > 80) {
                return NextResponse.json({ error: "Class name is too long." }, { status: 400 });
            }
            const inviteCode = await allocateUniqueInviteCode();
            const now = Timestamp.now();
            const ref = adminDb.collection("classes").doc();
            const data = {
                teacherId: userId,
                instituteId: null,
                name,
                description: description || null,
                inviteCode,
                studentsCount: 0,
                activeStudentsCount: 0,
                isArchived: false,
                labEnabled,
                createdAt: now,
                updatedAt: now,
            };
            await ref.set(data);
            return NextResponse.json({ class: serializeClass({ id: ref.id, ...data }) });
        }

        // ─── New shape: subject + section + group(s) + timetable ───────────
        const name = (subject || (typeof body.name === "string" ? body.name.trim() : "")).slice(0, 80);
        if (!name) {
            return NextResponse.json({ error: "Subject is required." }, { status: 400 });
        }

        // University comes from the teacher's profile; backfill from the
        // free-text institute (and persist it) if the profile predates the
        // directory.
        let universityId: string | null = (teacherData.profile?.universityId as string) || null;
        if (!universityId && teacherData.profile?.institute) {
            try {
                const u = await resolveOrCreateUniversity(teacherData.profile.institute, userId);
                universityId = u.university.id;
                await adminDb
                    .collection("teachers")
                    .doc(userId)
                    .set(
                        { profile: { universityId, institute: u.university.name }, updatedAt: Timestamp.now() },
                        { merge: true }
                    );
            } catch (e) {
                console.warn("[teacher/classes] university backfill failed:", e);
            }
        }

        // Section — reuse an existing one, or create from the typed details.
        let section = null;
        if (body.sectionId) {
            section = await getSectionById(String(body.sectionId));
            if (section && universityId && section.universityId !== universityId) {
                section = null; // never attach to another university's section
            }
        }
        if (!section && body.section?.name && universityId) {
            section = await resolveOrCreateSection(
                {
                    universityId,
                    name: String(body.section.name),
                    program: body.section.program ? String(body.section.program) : null,
                    batchYear: positiveIntOrNull(body.section.batchYear),
                    semester: positiveIntOrNull(body.section.semester),
                },
                userId
            );
        }

        // Groups — existing ids + any new names, merged. Combining = union roster.
        let groupIds: string[] = [];
        let groupNames: string[] = [];
        let groupCodes: string[] = [];
        if (section) {
            const existing = Array.isArray(body.groupIds) ? body.groupIds.map(String) : [];
            const newNames = Array.isArray(body.groups)
                ? body.groups.map((s: any) => String(s).trim()).filter(Boolean)
                : [];
            const resolved = await resolveGroups(section, existing, newNames, userId);
            groupIds = resolved.ids;
            groupNames = resolved.names;
            groupCodes = resolved.codes;
        }

        const meetings = sanitizeMeetings(body.meetings);
        const room =
            typeof body.room === "string" && body.room.trim() ? body.room.trim().slice(0, 40) : null;
        const sectionName = section
            ? [section.program, section.name].filter(Boolean).join(" · ")
            : null;

        // Integrity: block an exact duplicate — same subject + section + group
        // set for this teacher (mirrors the institute create guard). A combined
        // group-set is a distinct key, so it's allowed.
        const dupKey =
            normalizeUniversityName(subject || name) +
            "|" + (section?.id || "") +
            "|" + [...groupIds].sort().join(",");
        const mine = await adminDb.collection("classes").where("teacherId", "==", userId).get();
        const dup = mine.docs.find((d) => {
            const x = d.data() || {};
            if (x.isArchived) return false;
            const key =
                normalizeUniversityName(x.subject || x.name || "") +
                "|" + (x.sectionId || "") +
                "|" + (Array.isArray(x.groupIds) ? [...x.groupIds].sort().join(",") : "");
            return key === dupKey;
        });
        if (dup) {
            return NextResponse.json(
                {
                    error: "You already have a class for this subject + section + group(s). Edit that one, or change the subject or group.",
                    code: "duplicate_class",
                },
                { status: 409 }
            );
        }

        const inviteCode = await allocateUniqueInviteCode();
        const now = Timestamp.now();
        const ref = adminDb.collection("classes").doc();
        const data: Record<string, any> = {
            teacherId: userId,
            instituteId: null,
            name,
            description: description || null,
            inviteCode,
            universityId: universityId || null,
            sectionId: section?.id || null,
            sectionName,
            subject: subject || name,
            groupIds,
            groupNames,
            groupCodes,
            room,
            meetings,
            studentsCount: 0,
            activeStudentsCount: 0,
            isArchived: false,
            labEnabled,
            createdAt: now,
            updatedAt: now,
        };
        await ref.set(data);

        // Pull in any students already in the targeted groups (combined classes
        // inherit their groups' rosters). Usually a no-op for brand-new groups.
        let materialised = 0;
        if (groupIds.length) {
            try {
                materialised = await materializeClassRosterFromGroups(ref.id);
            } catch (e) {
                console.warn("[teacher/classes] roster materialise failed:", e);
            }
        }

        const fresh = await adminDb.collection("classes").doc(ref.id).get();
        return NextResponse.json({ class: serializeClass(fresh), materialised });
    } catch (error: any) {
        console.error("Create class failed:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to create class" },
            { status: 500 }
        );
    }
}
