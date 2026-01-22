"use client";

import {
    signInWithEmailAndPassword,
    signOut as firebaseSignOut,
    type User as FirebaseUser,
    type UserCredential,
} from "firebase/auth";
import { auth } from "./client";

/**
 * Sign in as admin
 */
export async function signInAdmin(
    email: string,
    password: string
): Promise<UserCredential> {
    // Login with standard Firebase Auth
    const credential = await signInWithEmailAndPassword(auth, email, password);

    // Note: Actual role verification happens in AuthContext via database lookup
    // or via IdToken result if Custom Claims are set up.
    // For this scaffold, we trust the AuthContext to check the Firestore 'role' field.

    return credential;
}

/**
 * Sign out admin
 */
export async function signOutAdmin(): Promise<void> {
    return firebaseSignOut(auth);
}

/**
 * Get current user
 */
export function getCurrentUser(): FirebaseUser | null {
    return auth.currentUser;
}
