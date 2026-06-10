/**
 * Read-authorization for attempt records (test + quiz results).
 *
 * The attempt-fetch endpoints were locked to the attempt OWNER after an IDOR
 * fix — which also locked out the teacher portal's "Result →" view: a teacher
 * reviewing their own student's attempt isn't the owner, so the API returned
 * 403 and the results pages rendered "Result not found".
 *
 * This helper widens READS (never writes) to callers with a legitimate
 * supervisory claim on the content the attempt belongs to:
 *   - the attempt owner (the student), as before;
 *   - the teacher who authored the quiz / test series;
 *   - an admin of the institute that owns that content.
 */
import { adminDb } from "@/lib/firebase/admin";
import { isInstituteAdmin } from "@/lib/server/institutes";

export async function callerCanReadAttempt(
    callerUid: string,
    attempt: { userId?: string },
    content: { collection: "tests" | "quizzes"; id: string | null | undefined }
): Promise<boolean> {
    if (!callerUid) return false;
    if (attempt.userId === callerUid) return true;
    if (!content.id) return false;

    const snap = await adminDb.collection(content.collection).doc(String(content.id)).get();
    if (!snap.exists) return false;
    const data = snap.data() || {};

    if (typeof data.teacherId === "string" && data.teacherId && data.teacherId === callerUid) {
        return true;
    }
    if (typeof data.instituteId === "string" && data.instituteId) {
        return isInstituteAdmin(data.instituteId, callerUid);
    }
    return false;
}
