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

// ─── Admin emails — no Firestore read needed for the gate ───────────────────
const ADMIN_EMAILS = [
    "mxansari007@gmail.com",
    "admin@digimine.com",
    "maazansari@digimine.com",
    "admin@digimine.shop",
];

interface AdminAuthContextValue {
    firebaseUser: FirebaseUser | null;
    user: AppUser | null;
    loading: boolean;
    isAdmin: boolean;
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

                // ── Gate: check email first, no Firestore needed ──────────────
                const email = (currentUser.email || "").toLowerCase();
                if (!ADMIN_EMAILS.includes(email)) {
                    setFirebaseUser(currentUser);
                    setUser(null);
                    setError(new Error("Unauthorized: Admin access required"));
                    setLoading(false);
                    return;
                }

                // ── Fetch profile from Firestore (best-effort, non-blocking) ──
                try {
                    const snap = await getDoc(doc(db, "users", currentUser.uid));
                    if (snap.exists()) {
                        setUser({ id: snap.id, ...snap.data() } as AppUser);
                    } else {
                        // Build a minimal profile from auth token
                        setUser({
                            id: currentUser.uid,
                            email,
                            displayName: currentUser.displayName || "Admin",
                            role: "admin",
                            purchasedProducts: [],
                        } as unknown as AppUser);
                    }
                } catch {
                    // Firestore read failed — still allow access (email is the gate)
                    setUser({
                        id: currentUser.uid,
                        email,
                        displayName: currentUser.displayName || "Admin",
                        role: "admin",
                        purchasedProducts: [],
                    } as unknown as AppUser);
                }

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

    // ── Route protection — only after auth fully resolved ───────────────────
    useEffect(() => {
        if (loading) return;

        const isLoginPage = pathname === "/login";
        const email = (firebaseUser?.email || "").toLowerCase();
        const adminVerified = !!firebaseUser && ADMIN_EMAILS.includes(email);

        console.log("🔐 Route Protection Check:", {
            pathname,
            isLoginPage,
            hasFirebaseUser: !!firebaseUser,
            email,
            adminVerified,
            adminEmails: ADMIN_EMAILS
        });

        if (!firebaseUser && !isLoginPage) {
            console.log("🔄 Redirecting to /login (no user)");
            router.push("/login");
        } else if (firebaseUser && !adminVerified && !isLoginPage) {
            console.log("🚫 Redirecting to /login?error=unauthorized (not admin)");
            router.push("/login?error=unauthorized");
        } else if (firebaseUser && adminVerified && isLoginPage) {
            console.log("✅ Redirecting to / (is admin on login page)");
            router.push("/");
        }
    }, [firebaseUser, loading, pathname, router]);

    const isAdmin = !!firebaseUser && ADMIN_EMAILS.includes(firebaseUser.email || "");

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
