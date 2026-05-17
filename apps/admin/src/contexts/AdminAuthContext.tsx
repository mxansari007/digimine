"use client";

import {
    createContext,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import type { User as AppUser } from "@digimine/types";
import { useRouter, usePathname } from "next/navigation";

// ─── Admin emails — fast gate for initial check ────────────────────────────
const ADMIN_EMAILS = [
    "mxansari007@gmail.com",
    "admin@digimine.com",
    "maazansari@digimine.com",
    "admin@digimine.shop",
    "maazansari@gmail.com",
];

const SUPER_ADMIN_EMAILS = [
    "mxansari007@gmail.com",
];

interface AdminAuthContextValue {
    firebaseUser: FirebaseUser | null;
    user: AppUser | null;
    loading: boolean;
    isAdmin: boolean;
    isSuperAdmin: boolean;
    error: Error | null;
    signOut: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | undefined>(undefined);

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
                if (!currentUser) {
                    setFirebaseUser(null);
                    setUser(null);
                    setLoading(false);
                    return;
                }

                const email = (currentUser.email || "").toLowerCase();
                let fetchedUser: AppUser | null = null;

                // ── Fetch profile from Firestore ──
                try {
                    const snap = await getDoc(doc(db, "users", currentUser.uid));
                    if (snap.exists()) {
                        fetchedUser = { id: snap.id, ...snap.data() } as AppUser;
                    }
                } catch (err) {
                    console.error("Firestore read error:", err);
                }

                // ── Gate Check ──────────────
                const isHardcodedAdmin = ADMIN_EMAILS.includes(email);
                const isFirestoreAdmin = fetchedUser?.role === "admin" || fetchedUser?.role === "super_admin";
                const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(email) || fetchedUser?.role === "super_admin";

                if (!isHardcodedAdmin && !isFirestoreAdmin) {
                    setFirebaseUser(currentUser);
                    setUser(null);
                    setError(new Error("Unauthorized: Admin access required"));
                    setLoading(false);
                    return;
                }

                // ── Finalize User Object ──
                if (!fetchedUser) {
                    fetchedUser = {
                        id: currentUser.uid,
                        email,
                        displayName: currentUser.displayName || "Admin",
                        role: isSuperAdmin ? "super_admin" : "admin",
                        purchasedProducts: [],
                    } as unknown as AppUser;
                } else if (isSuperAdmin && fetchedUser.role !== "super_admin") {
                    fetchedUser.role = "super_admin";
                }

                setUser(fetchedUser);
                setFirebaseUser(currentUser);
                setError(null);
                setLoading(false);
            },
            (err) => {
                console.error("Auth error:", err);
                setError(err);
                setLoading(false);
            }
        );

        return () => unsubscribeAuth();
    }, []);

    // ── Route protection ───────────────────
    useEffect(() => {
        if (loading) return;

        const isLoginPage = pathname === "/login";
        const email = (firebaseUser?.email || "").toLowerCase();
        
        const adminVerified = !!firebaseUser && (
            ADMIN_EMAILS.includes(email) || 
            user?.role === "admin" || 
            user?.role === "super_admin"
        );

        if (!firebaseUser && !isLoginPage) {
            router.push("/login");
        } else if (firebaseUser && !adminVerified && !isLoginPage) {
            router.push("/login?error=unauthorized");
        } else if (firebaseUser && adminVerified && isLoginPage) {
            router.push("/");
        }
    }, [firebaseUser, loading, pathname, router, user]);

    const isAdmin = !!firebaseUser && (
        ADMIN_EMAILS.includes(firebaseUser.email || "") || 
        user?.role === "admin" || 
        user?.role === "super_admin"
    );

    const isSuperAdmin = !!firebaseUser && (
        SUPER_ADMIN_EMAILS.includes(firebaseUser.email || "") || 
        user?.role === "super_admin"
    );

    return (
        <AdminAuthContext.Provider
            value={{ firebaseUser, user, loading, isAdmin, isSuperAdmin, error, signOut }}
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
