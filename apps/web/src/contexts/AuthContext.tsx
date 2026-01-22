"use client";

import {
    createContext,
    useContext,
    type ReactNode,
} from "react";
import { type User as FirebaseUser } from "firebase/auth";
import { useAuth } from "@/hooks/useAuth";
import { useUser } from "@/hooks/useUser";
import type { User } from "@digimine/types";

interface AuthContextValue {
    /** Firebase auth user */
    firebaseUser: FirebaseUser | null;
    /** Firestore user profile */
    user: User | null;
    /** Auth state is loading */
    loading: boolean;
    /** Auth error */
    error: Error | null;
    /** User is authenticated */
    isAuthenticated: boolean;
    /** User is admin */
    isAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
    children: ReactNode;
}

/**
 * Provider component for auth state
 */
export function AuthProvider({ children }: AuthProviderProps) {
    const authState = useAuth();
    const userState = useUser(authState.user?.uid);

    const value: AuthContextValue = {
        firebaseUser: authState.user,
        user: userState.user,
        loading: authState.loading || userState.loading,
        error: authState.error || userState.error,
        isAuthenticated: !!authState.user,
        isAdmin: userState.user?.role === "admin" || userState.user?.role === "super_admin",
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access auth context
 */
export function useAuthContext(): AuthContextValue {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuthContext must be used within an AuthProvider");
    }
    return context;
}
