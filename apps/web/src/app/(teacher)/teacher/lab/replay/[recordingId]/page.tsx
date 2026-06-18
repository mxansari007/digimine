import { notFound } from "next/navigation";
import { LabReplay } from "@/components/lab/LabReplay";
import { isVirtualLabEnabled } from "@/lib/flags";

/**
 * Teacher lab replay — `/teacher/lab/replay/[recordingId]`.
 *
 * Same replay surface as the student page; the teacher view differs only in the
 * back-links (the class command-center + the teacher recordings library).
 * Server component so the route is gated on the Virtual Lab feature flag —
 * `notFound()` when off. `LabReplay` loads the recording and re-verifies the
 * caller is a member of its class (here, a teacher) server-side.
 *
 * Navigation originates from the teacher Lab Library
 * (`/teacher/classes/[classId]/lab-library`), which passes `?classId=` so the
 * back-links return to that class + its recordings list.
 */
export default function TeacherLabReplayPage({
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
            viewer="teacher"
        />
    );
}
