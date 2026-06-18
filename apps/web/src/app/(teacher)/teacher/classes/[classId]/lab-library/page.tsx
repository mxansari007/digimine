import { notFound } from "next/navigation";
import { LabLibrary } from "@/components/lab/LabLibrary";
import { isVirtualLabEnabled } from "@/lib/flags";

/**
 * Teacher Lab Library — `/teacher/classes/[classId]/lab-library`.
 *
 * Same recordings list as the student page; the teacher view differs only in
 * the back-link target (the class command-center) and the empty-state copy.
 * Server component so the route is gated on the Virtual Lab feature flag —
 * `notFound()` when off. `LabLibrary` loads the recordings and re-verifies the
 * caller is a member of the class (here, a teacher) server-side.
 *
 * Reached from the class detail page's Virtual Lab card "Recordings" link.
 */
export default function TeacherLabLibraryPage({
    params,
}: {
    params: { classId: string };
}) {
    if (!isVirtualLabEnabled()) notFound();

    return <LabLibrary classId={params.classId} viewer="teacher" />;
}
