/**
 * Server-side section / group directory + roster materialisation.
 *
 * A Section is a cohort within a university; Groups (G1, G2…) divide it and
 * each carry a join invite code. A teacher's Class targets one or more groups
 * (combining groups = a class whose roster is the union of their members).
 * Everything here runs via the Admin SDK from API routes.
 */
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { normalizeUniversityName } from "@digimine/utils";
import type { Group, Section } from "@digimine/types";

// The pure timetable-row validator lives in @digimine/utils (unit-tested);
// re-export it so existing importers (`@/lib/server/sections`) are unchanged.
export { sanitizeMeetings } from "@digimine/utils";

const SECTIONS = "sections";
const GROUPS = "groups";
const GROUP_INVITE_PREFIX = "GRP-";
const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

type AnyDoc = FirebaseFirestore.DocumentSnapshot | FirebaseFirestore.QueryDocumentSnapshot;

function norm(s: string): string {
    return normalizeUniversityName(s);
}

function toDate(v: any): Date {
    if (v?.toDate) return v.toDate();
    if (v instanceof Date) return v;
    return new Date();
}

/** Reuse key: same university + program + batch + name → the same section. */
export function sectionKey(
    universityId: string,
    program: string | null | undefined,
    batchYear: number | null | undefined,
    name: string
): string {
    return [universityId, norm(program || ""), batchYear ?? "", norm(name)].join("|");
}

function docToSection(d: AnyDoc): Section {
    const data = d.data() || {};
    return {
        id: d.id,
        universityId: data.universityId,
        name: data.name,
        program: data.program ?? null,
        batchYear: data.batchYear ?? null,
        semester: data.semester ?? null,
        normalizedKey: data.normalizedKey || "",
        groupCount: data.groupCount ?? 0,
        studentCount: data.studentCount ?? 0,
        createdBy: data.createdBy || "",
        createdAt: toDate(data.createdAt),
        updatedAt: toDate(data.updatedAt),
    };
}

function docToGroup(d: AnyDoc): Group {
    const data = d.data() || {};
    return {
        id: d.id,
        sectionId: data.sectionId,
        universityId: data.universityId,
        name: data.name,
        inviteCode: data.inviteCode,
        studentCount: data.studentCount ?? 0,
        createdAt: toDate(data.createdAt),
        updatedAt: toDate(data.updatedAt),
    };
}

export async function getSectionById(sectionId: string): Promise<Section | null> {
    if (!sectionId) return null;
    const snap = await adminDb.collection(SECTIONS).doc(sectionId).get();
    return snap.exists ? docToSection(snap) : null;
}

/** Sections in a university, filtered by a free-text query (matched in memory). */
export async function searchSections(universityId: string, query: string, limit = 20): Promise<Section[]> {
    if (!universityId) return [];
    const snap = await adminDb.collection(SECTIONS).where("universityId", "==", universityId).limit(100).get();
    let rows = snap.docs.map(docToSection);
    const q = norm(query);
    if (q) {
        rows = rows.filter(
            (s) => norm(`${s.program || ""} ${s.name}`).includes(q) || norm(s.name).includes(q)
        );
    }
    rows.sort((a, b) => b.studentCount - a.studentCount || a.name.localeCompare(b.name));
    return rows.slice(0, limit);
}

export async function resolveOrCreateSection(
    input: {
        universityId: string;
        name: string;
        program?: string | null;
        batchYear?: number | null;
        semester?: number | null;
    },
    uid: string
): Promise<Section> {
    const name = (input.name || "").trim();
    if (!name) throw new Error("Section name is required");
    if (!input.universityId) throw new Error("A university is required to create a section");

    const key = sectionKey(input.universityId, input.program, input.batchYear, name);
    const existing = await adminDb.collection(SECTIONS).where("normalizedKey", "==", key).limit(1).get();
    if (!existing.empty) return docToSection(existing.docs[0]);

    const now = Timestamp.now();
    const ref = adminDb.collection(SECTIONS).doc();
    const doc = {
        universityId: input.universityId,
        name,
        program: input.program?.trim() || null,
        batchYear: input.batchYear ?? null,
        semester: input.semester ?? null,
        normalizedKey: key,
        groupCount: 0,
        studentCount: 0,
        createdBy: uid,
        createdAt: now,
        updatedAt: now,
    };
    await ref.set(doc);
    return { id: ref.id, ...doc, createdAt: now.toDate(), updatedAt: now.toDate() } as Section;
}

export async function listGroups(sectionId: string): Promise<Group[]> {
    if (!sectionId) return [];
    const snap = await adminDb.collection(GROUPS).where("sectionId", "==", sectionId).get();
    return snap.docs.map(docToGroup).sort((a, b) => a.name.localeCompare(b.name));
}

async function allocateUniqueGroupInviteCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
        let code = GROUP_INVITE_PREFIX;
        for (let i = 0; i < 8; i++) code += INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)];
        const existing = await adminDb.collection(GROUPS).where("inviteCode", "==", code).limit(1).get();
        if (existing.empty) return code;
    }
    return `${GROUP_INVITE_PREFIX}${Date.now().toString(36).toUpperCase()}`;
}

export async function getGroupByInviteCode(code: string): Promise<Group | null> {
    if (!code) return null;
    const snap = await adminDb.collection(GROUPS).where("inviteCode", "==", code).limit(1).get();
    return snap.empty ? null : docToGroup(snap.docs[0]);
}

export async function resolveOrCreateGroup(section: Section, name: string, _uid: string): Promise<Group> {
    const nm = (name || "").trim();
    if (!nm) throw new Error("Group name is required");
    const existing = await adminDb.collection(GROUPS).where("sectionId", "==", section.id).get();
    const match = existing.docs.find((d) => norm(d.data()?.name || "") === norm(nm));
    if (match) return docToGroup(match);

    const now = Timestamp.now();
    const inviteCode = await allocateUniqueGroupInviteCode();
    const ref = adminDb.collection(GROUPS).doc();
    const doc = {
        sectionId: section.id,
        universityId: section.universityId,
        name: nm,
        inviteCode,
        studentCount: 0,
        createdAt: now,
        updatedAt: now,
    };
    await ref.set(doc);
    await adminDb
        .collection(SECTIONS)
        .doc(section.id)
        .set({ groupCount: FieldValue.increment(1), updatedAt: now }, { merge: true });
    return { id: ref.id, ...doc, createdAt: now.toDate(), updatedAt: now.toDate() } as Group;
}

/** Resolve existing groupIds + new group names into a final list (ids + names). */
export async function resolveGroups(
    section: Section,
    existingGroupIds: string[],
    newGroupNames: string[],
    uid: string
): Promise<{ ids: string[]; names: string[]; codes: string[] }> {
    const ids: string[] = [];
    const names: string[] = [];
    const codes: string[] = [];
    for (const gid of existingGroupIds) {
        const snap = await adminDb.collection(GROUPS).doc(gid).get();
        if (snap.exists && snap.data()?.sectionId === section.id && !ids.includes(gid)) {
            ids.push(gid);
            names.push(snap.data()?.name || "");
            codes.push(snap.data()?.inviteCode || "");
        }
    }
    for (const nm of newGroupNames) {
        const g = await resolveOrCreateGroup(section, nm, uid);
        if (!ids.includes(g.id)) {
            ids.push(g.id);
            names.push(g.name);
            codes.push(g.inviteCode);
        }
    }
    return { ids, names, codes };
}

/**
 * Materialise the union of the class's groups' active members into
 * `classes/{classId}/students`, so all existing roster reads keep working.
 * Idempotent — skips students already enrolled. Returns the number added.
 */
export async function materializeClassRosterFromGroups(classId: string): Promise<number> {
    const classSnap = await adminDb.collection("classes").doc(classId).get();
    if (!classSnap.exists) return 0;
    const cls = classSnap.data() || {};
    const groupIds: string[] = Array.isArray(cls.groupIds) ? cls.groupIds : [];
    if (!groupIds.length) return 0;

    const teacherId = cls.teacherId || "";
    const now = Timestamp.now();
    const seen = new Set<string>();
    let added = 0;

    for (const gid of groupIds) {
        const members = await adminDb
            .collection(GROUPS)
            .doc(gid)
            .collection("members")
            .where("status", "==", "active")
            .get();
        for (const m of members.docs) {
            const md = m.data() || {};
            const sid = md.studentId || m.id;
            if (seen.has(sid)) continue;
            seen.add(sid);
            const ref = adminDb.collection("classes").doc(classId).collection("students").doc(sid);
            const ex = await ref.get();
            if (ex.exists) continue;
            await ref.set({
                classId,
                teacherId,
                studentId: sid,
                studentEmail: md.studentEmail || "",
                studentName: md.studentName || md.studentEmail || "Student",
                rollNumber: md.rollNumber || null,
                groupId: gid,
                enrolledAt: now,
                status: "active",
                totalAttempts: 0,
                lastActiveAt: null,
            });
            added++;
        }
    }

    if (added) {
        await adminDb
            .collection("classes")
            .doc(classId)
            .set(
                {
                    studentsCount: FieldValue.increment(added),
                    activeStudentsCount: FieldValue.increment(added),
                    updatedAt: now,
                },
                { merge: true }
            );
    }
    return added;
}

/**
 * Join a student to a group → auto-enroll them in EVERY non-archived class that
 * targets that group (combined classes included). Writes the group membership,
 * the per-class roster rows, and the user's denormalised arrays. Idempotent.
 */
export async function enrollStudentInGroup(
    group: Group,
    student: { studentId: string; studentEmail?: string | null; studentName?: string | null; rollNumber?: string | null }
): Promise<{ joinedClassIds: string[]; teacherIds: string[]; alreadyMember: boolean }> {
    const now = Timestamp.now();
    const studentId = student.studentId;
    const email = student.studentEmail || "";
    const display = student.studentName || student.studentEmail || "Student";

    // 1) Group membership.
    const memberRef = adminDb.collection(GROUPS).doc(group.id).collection("members").doc(studentId);
    const memberSnap = await memberRef.get();
    const wasActive = memberSnap.exists && memberSnap.data()?.status === "active";
    if (!memberSnap.exists) {
        await memberRef.set({
            groupId: group.id,
            sectionId: group.sectionId,
            universityId: group.universityId,
            studentId,
            studentEmail: email,
            studentName: display,
            rollNumber: student.rollNumber || null,
            status: "active",
            joinedAt: now,
        });
    } else if (!wasActive) {
        await memberRef.set({ status: "active", joinedAt: now }, { merge: true });
    }
    if (!wasActive) {
        await adminDb
            .collection(GROUPS)
            .doc(group.id)
            .set({ studentCount: FieldValue.increment(1), updatedAt: now }, { merge: true })
            .catch(() => {});
        await adminDb
            .collection(SECTIONS)
            .doc(group.sectionId)
            .set({ studentCount: FieldValue.increment(1), updatedAt: now }, { merge: true })
            .catch(() => {});
    }

    // 2) Every class that targets this group.
    const classesSnap = await adminDb.collection("classes").where("groupIds", "array-contains", group.id).get();
    const joinedClassIds: string[] = [];
    const teacherIds = new Set<string>();
    const memberships: { classId: string; teacherId: string; status: string; joinedAt: Timestamp }[] = [];

    for (const cd of classesSnap.docs) {
        const cls = cd.data() || {};
        if (cls.isArchived) continue;
        const classId = cd.id;
        const teacherId = cls.teacherId || "";
        const sref = adminDb.collection("classes").doc(classId).collection("students").doc(studentId);
        const sex = await sref.get();

        if (sex.exists && sex.data()?.status === "active") {
            joinedClassIds.push(classId);
            if (teacherId) teacherIds.add(teacherId);
            continue;
        }
        if (sex.exists) {
            await sref.set({ status: "active", groupId: group.id, updatedAt: now }, { merge: true });
            await adminDb
                .collection("classes")
                .doc(classId)
                .set({ activeStudentsCount: FieldValue.increment(1), updatedAt: now }, { merge: true });
        } else {
            await sref.set({
                classId,
                teacherId,
                studentId,
                studentEmail: email,
                studentName: display,
                rollNumber: student.rollNumber || null,
                groupId: group.id,
                enrolledAt: now,
                status: "active",
                totalAttempts: 0,
                lastActiveAt: null,
            });
            await adminDb
                .collection("classes")
                .doc(classId)
                .set(
                    {
                        studentsCount: FieldValue.increment(1),
                        activeStudentsCount: FieldValue.increment(1),
                        updatedAt: now,
                    },
                    { merge: true }
                );
        }
        joinedClassIds.push(classId);
        if (teacherId) {
            teacherIds.add(teacherId);
            memberships.push({ classId, teacherId, status: "active", joinedAt: now });
        }
    }

    // 3) User-side denormalised arrays (read by Firestore rules for content access).
    if (teacherIds.size) {
        const update: Record<string, any> = {
            enrolledTeacherIds: FieldValue.arrayUnion(...Array.from(teacherIds)),
            updatedAt: now,
        };
        if (memberships.length) {
            update.classMemberships = FieldValue.arrayUnion(...memberships);
        }
        await adminDb.collection("users").doc(studentId).set(update, { merge: true }).catch(() => {});
    }

    return { joinedClassIds, teacherIds: Array.from(teacherIds), alreadyMember: wasActive };
}
