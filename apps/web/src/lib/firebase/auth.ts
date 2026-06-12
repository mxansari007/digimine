"use client";

import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut as firebaseSignOut,
    sendPasswordResetEmail,
    updateProfile,
    updatePassword,
    reauthenticateWithCredential,
    EmailAuthProvider,
    type User,
    type UserCredential,
    sendSignInLinkToEmail,
    isSignInWithEmailLink,
    signInWithEmailLink,
    GoogleAuthProvider,
    signInWithPopup,
} from "firebase/auth";
import { auth } from "@digimine/config";

const googleProvider = new GoogleAuthProvider();

/**
 * Sign in with Google
 */
export async function signInWithGoogle(): Promise<UserCredential> {
    return signInWithPopup(auth, googleProvider);
}

/**
 * Sign in with email and password
 */
export async function signIn(
    email: string,
    password: string
): Promise<UserCredential> {
    return signInWithEmailAndPassword(auth, email, password);
}

/**
 * Create a new user account
 */
export async function signUp(
    email: string,
    password: string,
    displayName?: string
): Promise<UserCredential> {
    const credential = await createUserWithEmailAndPassword(auth, email, password);

    if (displayName && credential.user) {
        await updateProfile(credential.user, { displayName });
    }

    return credential;
}

/**
 * Sign out the current user
 */
export async function signOut(): Promise<void> {
    return firebaseSignOut(auth);
}

/**
 * Send password reset email
 */
export async function resetPassword(email: string): Promise<void> {
    return sendPasswordResetEmail(auth, email);
}

/**
 * Whether an account signs in with email + password (vs. only a federated
 * provider like Google). Only password accounts can change a password here.
 */
export function hasPasswordProvider(user: User): boolean {
    return user.providerData.some((p) => p.providerId === "password");
}

/**
 * Change the signed-in user's password. Firebase guards password changes
 * behind a recent login, so we reauthenticate with the current password
 * first — this also doubles as the "is the current password correct?" check.
 * Surfaces Firebase `auth/*` error codes unchanged for the caller to map to
 * friendly copy.
 */
export async function changePassword(
    user: User,
    currentPassword: string,
    newPassword: string
): Promise<void> {
    if (!user.email) {
        throw new Error("This account has no email address to verify against.");
    }
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);
}

/**
 * Send magic link for passwordless sign-in
 */
export async function sendMagicLink(email: string): Promise<void> {
    const actionCodeSettings = {
        // URL you want to redirect back to. The domain (localhost:3000) must be in the authorized domains list in the Firebase Console.
        url: `${window.location.origin}/auth/action?email=${encodeURIComponent(email)}`,
        handleCodeInApp: true,
    };

    // Store email in local storage for later retrieval
    window.localStorage.setItem('emailForSignIn', email);

    return await sendSignInLinkToEmail(auth, email, actionCodeSettings);
}

/**
 * Sign in with magic link
 */
export async function signInWithMagicLink(email: string, href: string): Promise<UserCredential> {
    if (!isSignInWithEmailLink(auth, href)) {
        throw new Error("Invalid sign-in link");
    }
    return await signInWithEmailLink(auth, email, href);
}

/**
 * Get the current authenticated user
 */
export function getCurrentUser(): User | null {
    return auth.currentUser;
}
