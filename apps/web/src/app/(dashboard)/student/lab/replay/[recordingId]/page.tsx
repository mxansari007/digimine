import { notFound } from "next/navigation";
import { LabReplay } from "@/components/lab/LabReplay";
import { isVirtualLabEnabled } from "@/lib/flags";

/**
 * Student lab replay — `/student/lab/replay/[recordingId]`.
 *
 * Server component so the route is gated on the Virtual Lab feature flag:
 * `notFound()` when off. When on it mounts `LabReplay`, which loads the
 * recording (re-verifying class membership server-side) and plays it back —
 * an HTML5 video when ready, a "still processing — refresh" state otherwise.
 *
 * Navigation originates from the Lab Library (`/classroom/[classId]/lab-library`),
 * which passes `?classId=` so the replay's back-links return to that class + its
 * recordings list.
 */
export default function StudentLabReplayPage({
    params,
    searchParams,
}: {
    params: { recordingId: string };
    searchParams: { classId?: string };
}) {
    if (!isVirtualLabEnabled()) notFound();

    return (
        <LabReplay
            recordingId={params.recordingId}
            classId={searchParams.classId}
            viewer="student"
        />
    );
}
