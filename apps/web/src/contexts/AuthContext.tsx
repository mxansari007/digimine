"use client";

import {
    createContext,
    useContext,
    type ReactNode,
} from "react";
import { type User as FirebaseUser } from "firebase/auth";
import { useAuth } from "@/hooks/useAuth";
import { useUser } from "@/hooks/useUser";
import { useHasTeacherProfile } from "@/hooks/useHasTeacherProfile";
import type { User } from "@digimine/types";

/** A dashboard the signed-in user can actually reach. */
export interface Portal {
    id: "student" | "teacher" | "institute" | "admin";
    label: string;
    href: string;
}

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
    /** User is teacher */
    isTeacher: boolean;
    /** User is an institute admin */
    isInstituteAdmin: boolean;
    /**
     * Every dashboard this user can reach, derived from their REAL roles
     * (not just the single `role` field). More than one entry means the
     * user holds multiple roles and should get a switcher.
     */
    portals: Portal[];
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
    children: ReactNode;
}

/**
 * Provider component for auth state.
 *
 * Role capabilities are computed from the actual source-of-truth, not the
 * single `users.role` field alone, so a user who is both a teacher and an
 * institute admin reads as BOTH — fixing the stale/inconsistent routing
 * that a one-role-at-a-time model produced.
 */
export function AuthProvider({ children }: AuthProviderProps) {
    const authState = useAuth();
    const userState = useUser(authState.user?.uid);
    const hasTeacherProfile = useHasTeacherProfile(authState.user?.uid);

    const user = userState.user;
    const role = user?.role ?? null;

    const isAdmin = role === "admin" || role === "super_admin";
    // A teacher profile is the authoritative signal for the teacher role —
    // it stays true even when the role field has been flipped to
    // institute_admin for the same person.
    const isTeacher = role === "teacher" || hasTeacherProfile;
    const isInstituteAdmin = role === "institute_admin";
    const isStudent = role === "customer";

    const portals: Portal[] = [];
    if (isTeacher) portals.push({ id: "teacher", label: "Teacher", href: "/teacher/dashboard" });
    if (isInstituteAdmin) portals.push({ id: "institute", label: "Institute", href: "/institute/dashboard" });
    if (isStudent) portals.push({ id: "student", label: "Student", href: "/dashboard" });
    if (isAdmin) portals.push({ id: "admin", label: "Admin", href: "/admin" });
    // Put the primary role (whatever the `role` field says) first, so the
    // header's single "my dashboard" target matches where login lands.
    const primaryId: Portal["id"] | null =
        role === "teacher" ? "teacher"
        : role === "institute_admin" ? "institute"
        : role === "customer" ? "student"
        : role === "admin" || role === "super_admin" ? "admin"
        : null;
    if (primaryId) portals.sort((a, b) => Number(b.id === primaryId) - Number(a.id === primaryId));

    const value: AuthContextValue = {
        firebaseUser: authState.user,
        user,
        loading: authState.loading || userState.loading,
        error: authState.error || userState.error,
        isAuthenticated: !!authState.user,
        isAdmin,
        isTeacher,
        isInstituteAdmin,
        portals,
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
