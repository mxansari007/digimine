import { notFound } from "next/navigation";
import { LabLibrary } from "@/components/lab/LabLibrary";
import { isVirtualLabEnabled } from "@/lib/flags";

/**
 * Student Lab Library — `/classroom/[classId]/lab-library`.
 *
 * Server component so the route is gated on the Virtual Lab feature flag:
 * `notFound()` when off (the page tree shakes out of the build), so there's no
 * half-built recordings list to stumble into. When on, it mounts `LabLibrary`,
 * which loads the class's recordings and re-verifies the caller is a member of
 * the class server-side before listing anything.
 *
 * Reached from the student classroom hub's "Lab recordings" link.
 */
export default function StudentLabLibraryPage({
    params,
}: {
    params: { classId: string };
}) {
    if (!isVirtualLabEnabled()) notFound();

    return <LabLibrary classId={params.classId} viewer="student" />;
}
