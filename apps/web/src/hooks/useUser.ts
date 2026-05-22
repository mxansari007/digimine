"use client";

import { useState, useEffect, useRef } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@digimine/config";
import type { User } from "@digimine/types";

interface UserState {
    user: User | null;
    loading: boolean;
    error: Error | null;
}

export function useUser(userId: string | undefined): UserState {
    const [state, setState] = useState<UserState>({
        user: null,
        loading: true,
        error: null,
    });
    const prevUserId = useRef<string | undefined>(userId);

    useEffect(() => {
        if (!userId) {
            setState({ user: null, loading: false, error: null });
            prevUserId.current = userId;
            return;
        }

        // When userId changes from falsy to truthy, reset loading
        // This prevents a flash where loading=false but user=null
        if (prevUserId.current !== userId) {
            setState({ user: null, loading: true, error: null });
        }
        prevUserId.current = userId;

        const unsubscribe = onSnapshot(
            doc(db, "users", userId),
            (snapshot) => {
                if (snapshot.exists()) {
                    const data = snapshot.data();
                    setState({
                        user: {
                            ...data,
                            id: snapshot.id,
                            createdAt: data.createdAt?.toDate() || new Date(),
                            updatedAt: data.updatedAt?.toDate() || new Date(),
                        } as User,
                        loading: false,
                        error: null,
                    });
                } else {
                    setState({ user: null, loading: false, error: null });
                }
            },
            (error) => {
                setState({ user: null, loading: false, error });
            }
        );

        return () => unsubscribe();
    }, [userId]);

    return state;
}
