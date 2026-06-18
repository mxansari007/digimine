import { notFound } from "next/navigation";
import { isVirtualLabEnabled } from "@/lib/flags";
import { LabInsights } from "@/components/lab/LabInsights";

/**
 * Teacher Lab Insights — `/teacher/classes/[classId]/lab-insights`.
 *
 * The engagement read-out for a class's virtual labs: a roll-up header (how many
 * sessions were held, total attendance, average engagement), a session selector,
 * and a per-session per-student table (time in lab, hands, shares, on-task %)
 * with lightweight CSS bars. Everything is COMPUTED ON READ from the
 * `labSessions/{id}/events` audit log behind the `/api/lab/analytics` +
 * `/api/lab/sessions/{id}/analytics` routes — no new Firestore writes.
 *
 * Server component so the route is gated on the Virtual Lab feature flag
 * (`notFound()` when off). Teacher-only data is enforced server-side by the
 * routes' `resolveClassLabRole` gate (and the page lives under the `(teacher)`
 * segment); `LabInsights` does the membership-gated fetches client-side.
 *
 * Reached from the class command-center's Virtual Lab card, next to the
 * "Lab recordings" link.
 */
export default function TeacherLabInsightsPage({
    params,
}: {
    params: { classId: string };
}) {
    if (!isVirtualLabEnabled()) notFound();

    return <LabInsights classId={params.classId} />;
}
