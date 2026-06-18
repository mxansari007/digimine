"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { fetchLabSession, type LabSessionSummary } from "@/lib/lab/labClient";
import type { LabRole } from "@digimine/types";
import { LabRoom } from "./LabRoom";

/**
 * LabRoomGate — the classroom-aware wrapper the lab room pages mount.
 *
 * The lab lives INSIDE a classroom, so before opening the LiveKit room this
 * gate loads the session via `GET /api/lab/sessions/[sessionId]` (which
 * re-verifies the caller is a member of the session's class). That buys three
 * things the bare `<LabRoom>` can't:
 *   - a hard membership gate — a non-member sees an error card, not a black
 *     room that fails to mint a token,
 *   - the owning `classId`, so the room's "back" link always returns to THAT
 *     class page (teachers → /teacher/classes/[id], students → /classroom/[id])
 *     instead of a generic hub, and
 *   - it defers mounting `<LabRoom>` (and its `useLabRoom` token mint) until the
 *     check passes, so a denied viewer never opens a connection.
 *
 * On success it hands off to `<LabRoom>` with the class back-link; that
 * component owns all the live wiring (`useLabRoom`, the map, video, chat).
 */

export interface LabRoomGateProps {
    sessionId: string;
    /**
     * The class this lab belongs to, when the originating page knows it (the
     * class entry points pass it as `?classId=`). Used for the back-link; if
     * absent we fall back to the session's own `classId` once it loads, then to
     * the viewer's hub.
     */
    classId?: string;
    /** Which side mounted us — picks the class back-link base + hub fallback. */
    viewer: LabRole;
}

/** Build the "back" target for a viewer: the class page if we know it, else the hub. */
function backLinkFor(
    viewer: LabRole,
    classId: string | null
): { href: string; label: string } {
    if (viewer === "teacher") {
        return classId
            ? { href: `/teacher/classes/${classId}`, label: "Back to class" }
            : { href: "/teacher/classes", label: "Back to my classes" };
    }
    return classId
        ? { href: `/classroom/${classId}`, label: "Back to class" }
        : { href: "/student/classrooms", label: "Back to my subjects" };
}

export function LabRoomGate({ sessionId, classId, viewer }: LabRoomGateProps) {
    const { firebaseUser, loading: authLoading } = useAuthContext();

    // Session lookup / membership gate. `null` session + no error = still
    // loading; `accessError` set = not a member / not found / load failed.
    const [session, setSession] = useState<LabSessionSummary | null>(null);
    const [accessError, setAccessError] = useState<string | null>(null);
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        if (authLoading) return;
        if (!firebaseUser) {
            setAccessError("You must be signed in to join the lab.");
            setChecking(false);
            return;
        }
        let cancelled = false;
        setChecking(true);
        setAccessError(null);
        fetchLabSession(firebaseUser, sessionId)
            .then(({ session }) => {
                if (!cancelled) setSession(session);
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setAccessError(
                        err instanceof Error ? err.message : "You can't access this lab."
                    );
                }
            })
            .finally(() => {
                if (!cancelled) setChecking(false);
            });
        return () => {
            cancelled = true;
        };
    }, [firebaseUser, authLoading, sessionId]);

    // The class back-link: the explicit prop wins, then the loaded session's
    // classId, then the viewer's hub.
    const back = backLinkFor(viewer, classId || session?.classId || null);

    if (checking) {
        return (
            <div className="space-y-4">
                <div className="h-5 w-40 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                <div className="h-7 w-48 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                <div className="h-96 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
            </div>
        );
    }

    if (accessError || !session) {
        return (
            <Card className="mx-auto max-w-md p-8 text-center">
                <h1 className="font-display text-lg font-semibold text-gray-900">
                    Lab unavailable
                </h1>
                <p className="mt-2 text-sm text-slate-500">
                    {accessError || "This lab could not be found."}
                </p>
                <Link href={back.href} className="mt-4 inline-block">
                    <Button variant="outline" size="sm">
                        {back.label}
                    </Button>
                </Link>
            </Card>
        );
    }

    return <LabRoom sessionId={sessionId} backHref={back.href} backLabel={back.label} />;
}

export default LabRoomGate;
