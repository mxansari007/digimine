import { notFound } from "next/navigation";
import { LabRoomGate } from "@/components/lab/LabRoomGate";
import { isVirtualLabEnabled } from "@/lib/flags";

/**
 * Student lab room — `/student/lab/[sessionId]`.
 *
 * Server component so the route itself is gated on the Virtual Lab feature
 * flag: when off, `notFound()` makes the path 404 (the page tree shakes out of
 * the build), so there's no half-built room to stumble into. When on, it mounts
 * `LabRoomGate`, which loads the session, re-verifies the caller is a member of
 * its class server-side, and only then opens the live room.
 *
 * Navigation always originates from the class page (the "Join Live Lab" entry on
 * `/classroom/[classId]`), which passes `?classId=` so the room's back-link
 * returns to that exact class.
 */
export default function StudentLabRoomPage({
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
            viewer="student"
        />
    );
}
