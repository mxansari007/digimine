/**
 * Shared ownership predicate for admin views.
 *
 * Mirrors the public-catalog gate used on the web side. A piece of content is
 * "platform-owned and safe for admin to attach to the public catalog" iff:
 *   - it has no `teacherId` (platform/admin-authored), OR
 *   - it has `teacherId` AND its visibility is "published" — meaning the
 *     teacher already submitted it for review AND it was approved into the
 *     public catalog.
 *
 * Anything else (a teacher's private quiz / classroom test) MUST NOT appear in
 * the regular admin pickers. It belongs in the /teacher-submissions queue,
 * where the admin can review, request permission, and approve before it
 * becomes available for public attachment.
 */
export function isPlatformOwned(doc: { teacherId?: string | null; visibility?: string | null }): boolean {
    const teacherId = typeof doc.teacherId === "string" ? doc.teacherId.trim() : "";
    if (!teacherId) return true;
    return (doc.visibility || "") === "published";
}
