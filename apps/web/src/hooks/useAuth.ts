"use client";

import { useState, useEffect } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@digimine/config";

interface AuthState {
    user: User | null;
    loading: boolean;
    error: Error | null;
}

/**
 * Hook to subscribe to Firebase auth state changes
 */
export function useAuth(): AuthState {
    const [state, setState] = useState<AuthState>({
        user: null,
        loading: true,
        error: null,
    });

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(
            auth,
            (user) => {
                setState({
                    user,
                    loading: false,
                    error: null,
                });
            },
            (error) => {
                setState({
                    user: null,
                    loading: false,
                    error,
                });
            }
        );

        return () => unsubscribe();
    }, []);

    return state;
}
