/**
 * Server core for the class resource library.
 *
 * A "resource" is a file (PDF / slide deck / document / image / video) or an
 * external link that a class member shares for everyone in the class to grab.
 * Files live in Cloud Storage under `classResources/{classId}/{uid}/...`; the
 * metadata doc lives in the server-only `classResources` collection and is
 * gated on class membership through `resolveClassMember` (see classCommunity).
 *
 * Access model mirrors threads: active students, the class teacher, and the
 * institute's admins can list + add resources. A member can delete their own;
 * teachers/admins can delete or pin any. The collection is server-only — every
 * read/write goes through /api/classes/[classId]/resources* (admin SDK); see
 * firestore.rules.
 */
import { toIsoDate } from "@/lib/server/classroomAccess";

export const CLASS_RESOURCES = "classResources";

export type ResourceKind = "document" | "video" | "image" | "link";

const BUCKET_URL_RE =
    /^https:\/\/(firebasestorage\.googleapis\.com|storage\.googleapis\.com)\//;
// Emulator: localhost, 127.0.0.1, and 10.0.2.2 (the Android emulator's alias
// for the host machine — the mobile app's storage emulator URLs use it).
const LOCAL_URL_RE = /^https?:\/\/(127\.0\.0\.1|localhost|10\.0\.2\.2)(:\d+)?\//;

/** A download URL that came from our own Storage bucket (or the emulator). */
export function isStorageUrl(url: string): boolean {
    return BUCKET_URL_RE.test(url) || LOCAL_URL_RE.test(url);
}

/**
 * Pull the object path out of a Firebase Storage download URL — the
 * URL-decoded segment after `/o/`. Returns null if the URL isn't a
 * download URL. Used to prove a submitted fileUrl actually points at the
 * storagePath we validated (and not some other object in the bucket).
 */
export function objectPathFromUrl(url: string): string | null {
    const m = url.match(/\/o\/([^?]+)/);
    if (!m) return null;
    try {
        return decodeURIComponent(m[1]);
    } catch {
        return null;
    }
}

/** Any http(s) URL — used for the "share a link" resource kind. */
export function isHttpUrl(url: string): boolean {
    return /^https?:\/\//i.test(url) && url.length <= 2000;
}

/** Bucket all the office/media MIME types down to one of our display kinds. */
export function kindForMime(mimeType: string): ResourceKind {
    const m = (mimeType || "").toLowerCase();
    if (m.startsWith("image/")) return "image";
    if (m.startsWith("video/")) return "video";
    return "document";
}

export function serializeResource(doc: any) {
    const data = doc?.data ? doc.data() : doc;
    if (!data) return null;
    return {
        id: doc.id || data.id,
        classId: data.classId || "",
        uploaderId: data.uploaderId || "",
        uploaderName: data.uploaderName || "Member",
        uploaderAvatar: data.uploaderAvatar ?? null,
        uploaderRole: data.uploaderRole || "student",
        title: data.title || "",
        description: data.description || "",
        kind: data.kind || "document",
        fileUrl: data.fileUrl || "",
        fileName: data.fileName || "",
        mimeType: data.mimeType || "",
        size: typeof data.size === "number" ? data.size : 0,
        isPinned: Boolean(data.isPinned),
        createdAt: toIsoDate(data.createdAt),
    };
}
