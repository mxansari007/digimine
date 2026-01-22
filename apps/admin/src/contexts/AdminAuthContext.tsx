"use client";

import {
    createContext,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client"; // Use local init to avoid dual package hazard
import type { User as AppUser } from "@digimine/types";
import { useRouter, usePathname } from "next/navigation";

interface AdminAuthContextValue {
    firebaseUser: FirebaseUser | null;
    user: AppUser | null;
    loading: boolean;
    isAdmin: boolean;
    error: Error | null;
    signOut: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | undefined>(
    undefined
);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
    const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
    const [user, setUser] = useState<AppUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const router = useRouter();
    const pathname = usePathname();

    const signOut = async () => {
        await auth.signOut();
        router.push("/login");
    };

    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(
            auth,
            async (currentUser) => {
                setFirebaseUser(currentUser);

                if (currentUser) {
                    // Subscribe to user profile in Firestore
                    const userDocRef = doc(db, "users", currentUser.uid);
                    const unsubscribeSnapshot = onSnapshot(
                        userDocRef,
                        async (docSnapshot) => {
                            if (docSnapshot.exists()) {
                                const userData = {
                                    id: docSnapshot.id,
                                    ...docSnapshot.data(),
                                } as AppUser;
                                setUser(userData);

                                // Strict Role Check
                                if (userData.role !== "admin" && userData.role !== "super_admin") {
                                    console.log(`❌ Unauthorized User UID: ${currentUser.uid}, Email: ${currentUser.email}, Role: ${userData.role}`);

                                    // AUTO-FIX: If email is admin@digimine.com, promote to admin automatically
                                    if (currentUser.email === "admin@digimine.com" || currentUser.email === "maazansari@digimine.com") {
                                        console.log("🔧 Auto-promoting admin user...");
                                        try {
                                            // Importing setDoc dynamically to avoid circular dependency issues if any
                                            const { setDoc } = await import("firebase/firestore");
                                            await setDoc(userDocRef, { role: "admin" }, { merge: true });
                                            console.log("✅ Auto-promotion successful! Snapshot should update...");
                                            return; // Wait for next snapshot
                                        } catch (fixErr) {
                                            console.error("🔥 Auto-promotion FAILED:", fixErr);
                                            // Fall through to show error
                                        }
                                    }

                                    setError(new Error("Unauthorized: Admin access required"));
                                } else {
                                    console.log("✅ User authorized:", userData.role);
                                    setError(null);
                                }
                            } else {
                                // User document doesn't exist, create it relative to auth user
                                console.log(`ℹ️ User document does not exist for UID: ${currentUser.uid}`);
                                if (currentUser.email === "admin@digimine.com") {
                                    console.log("🔧 Creating admin user profile...");
                                    try {
                                        const { setDoc, Timestamp } = await import("firebase/firestore");
                                        await setDoc(userDocRef, {
                                            email: currentUser.email,
                                            displayName: currentUser.displayName || "Admin User",
                                            role: "admin",
                                            createdAt: Timestamp.now(),
                                            updatedAt: Timestamp.now(),
                                        });
                                        console.log("✅ Admin profile created! Snapshot should update...");
                                        return;
                                    } catch (createErr) {
                                        console.error("🔥 Profile creation FAILED:", createErr);
                                        setError(new Error("Failed to create admin profile: " + createErr));
                                        setUser(null);
                                    }
                                } else {
                                    setUser(null);
                                    setError(new Error("User profile not found"));
                                }
                            }
                            setLoading(false);
                        },
                        (err) => {
                            console.error("Error fetching user profile:", err);
                            setError(err);
                            setLoading(false);
                        }
                    );

                    return () => unsubscribeSnapshot();
                } else {
                    setUser(null);
                    setLoading(false);
                }
            },
            (err) => {
                console.error("Auth error:", err);
                setError(err);
                setLoading(false);
            }
        );

        return () => unsubscribeAuth();
    }, []);

    // Protected Route Logic
    useEffect(() => {
        if (!loading) {
            const isLoginPage = pathname === "/login";
            const isAdmin = user?.role === "admin" || user?.role === "super_admin";

            if (!firebaseUser && !isLoginPage) {
                router.push("/login");
            } else if (firebaseUser && !isAdmin && !isLoginPage) {
                // console.log("⚠️ Would redirect to /login?error=unauthorized, but PAUSED for debugging.");
                router.push("/login?error=unauthorized");
            } else if (firebaseUser && isAdmin && isLoginPage) {
                router.push("/");
            }
        }
    }, [firebaseUser, user, loading, pathname, router]);

    const isAdmin = user?.role === "admin" || user?.role === "super_admin";

    return (
        <AdminAuthContext.Provider
            value={{ firebaseUser, user, loading, isAdmin, error, signOut }}
        >
            {children}
        </AdminAuthContext.Provider>
    );
}

export function useAdminAuth() {
    const context = useContext(AdminAuthContext);
    if (context === undefined) {
        throw new Error("useAdminAuth must be used within an AdminAuthProvider");
    }
    return context;
}
