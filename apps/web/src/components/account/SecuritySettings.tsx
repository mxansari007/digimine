"use client";

/**
 * Security settings card — lets any signed-in user change their password.
 * Shared across the student, teacher, and institute profile pages so the
 * flow (and its error handling) stays identical everywhere.
 *
 *  - Password accounts get a current → new → confirm form. We reauthenticate
 *    with the current password before updating, which is both Firebase's
 *    requirement and our "is the current password right?" check.
 *  - Federated-only accounts (Google) have no password to change; we say so
 *    plainly instead of showing a form that can't work.
 *  - A "forgot your current password?" reset-email fallback covers the case
 *    where the user can't supply their current password.
 */
import { useState } from "react";
import { Button, Card, useToast } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { changePassword, hasPasswordProvider, resetPassword } from "@/lib/firebase/auth";

const MIN_LENGTH = 8;

/** Map raw Firebase auth error codes to copy a user can act on. */
function friendlyError(code: string | undefined): string {
    switch (code) {
        case "auth/wrong-password":
        case "auth/invalid-credential":
        case "auth/invalid-login-credentials":
            return "Your current password is incorrect.";
        case "auth/weak-password":
            return "That new password is too weak — use at least 8 characters.";
        case "auth/requires-recent-login":
            return "For security, please sign out and sign back in, then try again.";
        case "auth/too-many-requests":
            return "Too many attempts. Wait a few minutes and try again.";
        case "auth/network-request-failed":
            return "Network error — check your connection and try again.";
        default:
            return "Couldn't change your password. Please try again.";
    }
}

export function SecuritySettings() {
    const { firebaseUser } = useAuthContext();
    const toast = useToast();

    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [saving, setSaving] = useState(false);
    const [sendingReset, setSendingReset] = useState(false);
    const [error, setError] = useState("");

    const isPasswordAccount = firebaseUser ? hasPasswordProvider(firebaseUser) : false;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!firebaseUser) return;
        setError("");

        if (newPassword.length < MIN_LENGTH) {
            setError(`Your new password must be at least ${MIN_LENGTH} characters.`);
            return;
        }
        if (newPassword !== confirmPassword) {
            setError("The new password and confirmation don't match.");
            return;
        }
        if (newPassword === currentPassword) {
            setError("Your new password must be different from the current one.");
            return;
        }

        setSaving(true);
        try {
            await changePassword(firebaseUser, currentPassword, newPassword);
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            toast.success("Password updated", {
                description: "Use your new password the next time you sign in.",
            });
        } catch (err: any) {
            const message = friendlyError(err?.code);
            setError(message);
        } finally {
            setSaving(false);
        }
    };

    const handleResetEmail = async () => {
        if (!firebaseUser?.email) return;
        setSendingReset(true);
        try {
            await resetPassword(firebaseUser.email);
            toast.success("Reset link sent", {
                description: `Check ${firebaseUser.email} for a link to set a new password.`,
            });
        } catch {
            toast.error("Couldn't send the reset email. Please try again.");
        } finally {
            setSendingReset(false);
        }
    };

    return (
        <Card padding="lg">
            <h2 className="font-display text-lg font-semibold text-gray-900">Security</h2>
            <p className="mt-0.5 text-sm text-gray-500">
                {isPasswordAccount
                    ? "Change the password you use to sign in."
                    : "How you sign in to your account."}
            </p>

            {isPasswordAccount ? (
                <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                    {error && (
                        <div className="rounded-lg border border-red-200 dark:border-red-500/25 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                            {error}
                        </div>
                    )}

                    <div>
                        <label htmlFor="current-password" className="stat-label">
                            Current password
                        </label>
                        <input
                            id="current-password"
                            type="password"
                            autoComplete="current-password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            className="field-input mt-1.5"
                            placeholder="Your current password"
                        />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <label htmlFor="new-password" className="stat-label">
                                New password
                            </label>
                            <input
                                id="new-password"
                                type="password"
                                autoComplete="new-password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="field-input mt-1.5"
                                placeholder="At least 8 characters"
                            />
                        </div>
                        <div>
                            <label htmlFor="confirm-password" className="stat-label">
                                Confirm new password
                            </label>
                            <input
                                id="confirm-password"
                                type="password"
                                autoComplete="new-password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="field-input mt-1.5"
                                placeholder="Re-enter new password"
                            />
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                        <button
                            type="button"
                            onClick={handleResetEmail}
                            disabled={sendingReset}
                            className="text-xs font-medium text-primary-700 dark:text-primary-300 hover:underline disabled:opacity-60"
                        >
                            {sendingReset ? "Sending…" : "Forgot your current password?"}
                        </button>
                        <Button
                            type="submit"
                            variant="primary"
                            isLoading={saving}
                            disabled={!currentPassword || !newPassword || !confirmPassword}
                        >
                            Update password
                        </Button>
                    </div>
                </form>
            ) : (
                <div className="mt-5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-3.5 text-sm text-slate-600 dark:text-slate-300">
                    You sign in with Google, so there&apos;s no password to change here.
                    Manage your password from your Google Account&apos;s security settings.
                </div>
            )}
        </Card>
    );
}
