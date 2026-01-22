"use client";

import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@digimine/config";
import type { User } from "@digimine/types";

interface UserState {
    user: User | null;
    loading: boolean;
    error: Error | null;
}

/**
 * Hook to fetch and subscribe to user profile from Firestore
 */
export function useUser(userId: string | undefined): UserState {
    const [state, setState] = useState<UserState>({
        user: null,
        loading: true,
        error: null,
    });

    useEffect(() => {
        if (!userId) {
            setState({ user: null, loading: false, error: null });
            return;
        }

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
