import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { getUserIdentity, resolveClassMember } from "@/lib/server/classCommunity";
import {
    CLASS_RESOURCES,
    isHttpUrl,
    isStorageUrl,
    kindForMime,
    objectPathFromUrl,
    serializeResource,
} from "@/lib/server/classResources";
import { createNotifications } from "@/lib/server/notifications";

export const dynamic = "force-dynamic";

/** List a class's shared resources. Pinned first, then newest. */
export async function GET(req: Request, { params }: { params: { classId: string } }) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        const member = await resolveClassMember(params.classId, userId || "");
        if (!member.ok) {
            return NextResponse.json({ error: member.error }, { status: member.status });
        }

        // Prefer the indexed query; fall back to an unordered fetch + in-code
        // sort when the composite index isn't built yet (mirrors the threads
        // route — the list is capped, so sorting in code is cheap and the
        // library never hard-fails on index timing).
        let snap: FirebaseFirestore.QuerySnapshot;
        try {
            snap = await adminDb
                .collection(CLASS_RESOURCES)
                .where("classId", "==", params.classId)
                .orderBy("createdAt", "desc")
                .limit(200)
                .get();
        } catch {
            snap = await adminDb
                .collection(CLASS_RESOURCES)
                .where("classId", "==", params.classId)
                .limit(200)
                .get();
        }

        const docs = snap.docs
            .filter((d) => !d.data().isDeleted)
            .sort((a, b) => (b.data().createdAt?.toMillis?.() ?? 0) - (a.data().createdAt?.toMillis?.() ?? 0));
        const resources = docs
            .map((d) => serializeResource(d))
            // Pinned resources surface first regardless of recency.
            .sort((a: any, b: any) => Number(b.isPinned) - Number(a.isPinned));

        return NextResponse.json({ resources, role: member.role, block: member.block });
    } catch (error: any) {
        console.error("List resources failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}

/**
 * Share a resource. Two shapes:
 *   - File:  { title, description?, fileUrl, storagePath, fileName, mimeType, size }
 *            fileUrl must be a download URL from our Storage bucket, and
 *            storagePath must live under classResources/{classId}/{uid}/.
 *   - Link:  { title, description?, link }   (any http(s) URL)
 */
export async function POST(req: Request, { params }: { params: { classId: string } }) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        const member = await resolveClassMember(params.classId, userId || "");
        if (!member.ok) {
            return NextResponse.json({ error: member.error }, { status: member.status });
        }

        // A student muted from this class's discussions can't dump resources either.
        if (member.role === "student" && member.block.threads) {
            return NextResponse.json(
                { error: "Your teacher has muted you in this class." },
                { status: 403 }
            );
        }

        const body = await req.json().catch(() => ({}));
        const title = typeof body.title === "string" ? body.title.trim().slice(0, 160) : "";
        const description =
            typeof body.description === "string" ? body.description.trim().slice(0, 600) : "";
        if (!title) {
            return NextResponse.json({ error: "Give the resource a title." }, { status: 400 });
        }

        const link = typeof body.link === "string" ? body.link.trim() : "";
        const fileUrl = typeof body.fileUrl === "string" ? body.fileUrl.trim() : "";

        let resource: {
            kind: "document" | "video" | "image" | "link";
            fileUrl: string;
            storagePath: string | null;
            fileName: string;
            mimeType: string;
            size: number;
        };

        if (fileUrl) {
            if (!isStorageUrl(fileUrl)) {
                return NextResponse.json({ error: "Unrecognised file URL." }, { status: 400 });
            }
            const storagePath = typeof body.storagePath === "string" ? body.storagePath : "";
            // The object MUST live in this class's folder, owned by the caller —
            // stops a member recording a file from another class or user.
            const expectedPrefix = `classResources/${params.classId}/${member.userId}/`;
            if (!storagePath.startsWith(expectedPrefix)) {
                return NextResponse.json({ error: "Invalid file path." }, { status: 400 });
            }
            // The download URL must actually point AT that storagePath — not at
            // some other object in the bucket. Otherwise the prefix check only
            // constrains what we'd delete, while the library could serve an
            // arbitrary file (another class's recording, another user's upload).
            if (objectPathFromUrl(fileUrl) !== storagePath) {
                return NextResponse.json({ error: "File URL doesn't match the upload." }, { status: 400 });
            }
            const mimeType =
                typeof body.mimeType === "string" ? body.mimeType.slice(0, 120) : "";
            resource = {
                kind: kindForMime(mimeType),
                fileUrl,
                storagePath,
                fileName: typeof body.fileName === "string" ? body.fileName.slice(0, 160) : "file",
                mimeType,
                size: Number.isFinite(body.size) ? Math.max(0, Math.floor(body.size)) : 0,
            };
        } else if (link) {
            if (!isHttpUrl(link)) {
                return NextResponse.json({ error: "Enter a valid http(s) link." }, { status: 400 });
            }
            resource = {
                kind: "link",
                fileUrl: link,
                storagePath: null,
                fileName: typeof body.fileName === "string" ? body.fileName.slice(0, 160) : link,
                mimeType: "",
                size: 0,
            };
        } else {
            return NextResponse.json(
                { error: "Attach a file or paste a link to share." },
                { status: 400 }
            );
        }

        const identity = await getUserIdentity(member.userId);
        const now = Timestamp.now();
        const ref = adminDb.collection(CLASS_RESOURCES).doc();
        const data = {
            classId: params.classId,
            uploaderId: member.userId,
            uploaderName: identity.name,
            uploaderAvatar: identity.avatarUrl,
            uploaderRole: member.role,
            title,
            description,
            ...resource,
            isPinned: false,
            isDeleted: false,
            createdAt: now,
            updatedAt: now,
        };
        await ref.set(data);

        // A teacher dropping a resource pings every active student — the same
        // broadcast affordance announcements use. Student-shared resources stay
        // quiet (they show up in the library without a notification storm).
        if (member.role === "teacher" || member.role === "institute_admin") {
            const studentsSnap = await adminDb
                .collection("classes")
                .doc(params.classId)
                .collection("students")
                .where("status", "==", "active")
                .get();
            void createNotifications(
                studentsSnap.docs.map((d) => d.id),
                {
                    type: "resource_shared",
                    title: `New resource in ${member.classDoc?.name || "your class"}`,
                    body: title,
                    data: { classId: params.classId, resourceId: ref.id, kind: "resource" },
                    actorId: member.userId,
                    actorName: identity.name,
                }
            );
        }

        return NextResponse.json({ resource: serializeResource({ id: ref.id, ...data }) });
    } catch (error: any) {
        console.error("Create resource failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
