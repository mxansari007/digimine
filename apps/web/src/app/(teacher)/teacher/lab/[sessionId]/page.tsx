import { notFound } from "next/navigation";
import { LabRoomGate } from "@/components/lab/LabRoomGate";
import { isVirtualLabEnabled } from "@/lib/flags";

/**
 * Teacher lab room — `/teacher/lab/[sessionId]`.
 *
 * Same classroom-aware shell as the student page; the teacher view differs only
 * in the server-minted `role` (`teacher`), which makes the room render the "Run
 * the room" controls (Broadcast / View screen / Remote assist / Recording).
 *
 * Server component so the route is gated on the Virtual Lab feature flag —
 * `notFound()` when off. `LabRoomGate` loads the session and re-verifies the
 * caller is a teacher of its class before opening the room (the token route
 * also mints a `roomAdmin` grant only for the owning teacher / platform admins).
 *
 * Navigation originates from the class detail page's "Start / Resume lab" card,
 * which passes `?classId=` so the back-link returns to that class.
 */
export default function TeacherLabRoomPage({
    params,
    searchParams,
}: {
    params: { sessionId: string };
    searchParams: { classId?: string };
}) {
    if (!isVirtualLabEnabled()) notFound();

    return (
        <LabRoomGate
            sessionId={params.sessionId}
            classId={searchParams.classId}
            viewer="teacher"
        />
    );
}
