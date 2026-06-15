import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import {
    assertInstituteAdmin,
    bumpInstituteCounts,
} from "@/lib/server/institutes";
import {
    allocateUniqueInviteCode,
    serializeClass,
} from "@/lib/server/classes";
import { normalizeUniversityName } from "@digimine/utils";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { instituteId: string } }) {
    try {
        const auth = await assertInstituteAdmin(req, params.instituteId);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

        const snap = await adminDb
            .collection("classes")
            .where("instituteId", "==", params.instituteId)
            .get();
        const classes = snap.docs.map((d) => serializeClass({ id: d.id, ...d.data() }));
        classes.sort((a, b) => {
            const aT = a?.createdAt ? Date.parse(a.createdAt) : 0;
            const bT = b?.createdAt ? Date.parse(b.createdAt) : 0;
            return bT - aT;
        });
        return NextResponse.json({ classes });
    } catch (error: any) {
        console.error("Institute classes list failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}

/**
 * Institute admin creates a class. Optionally pre-assigns a teacher. The
 * teacher MUST be a currently-active member of this institute's roster — we
 * verify before stamping `teacherId` on the new class.
 */
export async function POST(req: Request, { params }: { params: { instituteId: string } }) {
    try {
        const auth = await assertInstituteAdmin(req, params.instituteId);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

        const body = await req.json().catch(() => ({}));
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
        if (name.length > 80) return NextResponse.json({ error: "Name too long" }, { status: 400 });

        // Section + group(s). A class is a section ("24cs601") taught to one or
        // more groups; selecting MULTIPLE groups makes a single COMBINED class
        // (its roster is the union). We block creating a second class for the
        // EXACT same section + group set; a combined set is a distinct class.
        const sectionName = name;
        const rawGroups = Array.isArray(body.groups)
            ? body.groups
            : typeof body.group === "string"
            ? [body.group]
            : [];
        const groupNames = Array.from(
            new Set(
                rawGroups
                    .map((g: unknown) => String(g).trim())
                    .filter(Boolean)
                    .map((g: string) => g.slice(0, 40))
            )
        ) as string[];
        const sectionGroupKey =
            normalizeUniversityName(sectionName) +
            "|" +
            groupNames.map((g) => normalizeUniversityName(g)).sort().join(",");

        // Reject an exact (section + same group set) duplicate among LIVE classes.
        const existingSnap = await adminDb
            .collection("classes")
            .where("instituteId", "==", params.instituteId)
            .get();
        const clash = existingSnap.docs.find(
            (d) => !(d.data() || {}).isArchived && (d.data() || {}).sectionGroupKey === sectionGroupKey
        );
        if (clash) {
            const label = groupNames.length ? `${sectionName} · ${groupNames.join(", ")}` : sectionName;
            return NextResponse.json(
                {
                    error: `A class for "${label}" already exists. Add it as a combined class with other groups, or pick a different group.`,
                    code: "duplicate_section_group",
                },
                { status: 409 }
            );
        }

        const displayName = groupNames.length ? `${sectionName} · ${groupNames.join(", ")}` : sectionName;

        const description = typeof body.description === "string" ? body.description.trim() : "";
        const requestedTeacherId =
            typeof body.teacherId === "string" && body.teacherId ? body.teacherId : "";

        let teacherId = "";
        if (requestedTeacherId) {
            const rosterSnap = await adminDb
                .collection("institutes")
                .doc(params.instituteId)
                .collection("teachers")
                .doc(requestedTeacherId)
                .get();
            const data = rosterSnap.exists ? rosterSnap.data() || {} : null;
            if (!data || data.status !== "active") {
                return NextResponse.json(
                    { error: "Teacher is not an active member of this institute" },
                    { status: 400 }
                );
            }
            teacherId = requestedTeacherId;
        }

        const inviteCode = await allocateUniqueInviteCode();
        const now = Timestamp.now();
        const ref = adminDb.collection("classes").doc();
        const data = {
            teacherId,
            instituteId: params.instituteId,
            name: displayName,
            sectionName,
            groupNames,
            sectionGroupKey,
            description: description || null,
            inviteCode,
            studentsCount: 0,
            activeStudentsCount: 0,
            isArchived: false,
            createdAt: now,
            updatedAt: now,
        };
        await ref.set(data);

        await bumpInstituteCounts(params.instituteId, { classCount: 1 });

        return NextResponse.json({
            class: serializeClass({ id: ref.id, ...data }),
        });
    } catch (error: any) {
        console.error("Institute class create failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
