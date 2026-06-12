"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@digimine/config";

/**
 * Live "does this user have a teacher profile?" signal.
 *
 * A user can hold more than one role at once — most commonly a teacher who
 * also administers an institute. The single `users.role` field can only
 * record one of those, so role booleans derived from it alone go stale for
 * multi-role users. The authoritative signal for "is a teacher" is the
 * existence of their `teachers/{uid}` doc, which the rules let them read
 * for their own uid. We watch it so the capability stays correct even if
 * the role field says something else.
 */
export function useHasTeacherProfile(uid: string | undefined): boolean {
    const [hasProfile, setHasProfile] = useState(false);

    useEffect(() => {
        if (!uid) {
            setHasProfile(false);
            return;
        }
        const unsubscribe = onSnapshot(
            doc(db, "teachers", uid),
            (snap) => setHasProfile(snap.exists()),
            () => setHasProfile(false)
        );
        return () => unsubscribe();
    }, [uid]);

    return hasProfile;
}
