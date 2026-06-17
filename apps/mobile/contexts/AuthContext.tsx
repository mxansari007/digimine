import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { api } from "@/lib/api";
import { googleSignInIdToken, googleSignOut } from "@/lib/googleAuth";

interface AuthContextValue {
  user: User | null;
  /** True until the persisted session has been restored (or ruled out). */
  loading: boolean;
  /**
   * Whether the signed-in user owns a teacher account. `null` while the role
   * is still being probed (so the router can hold instead of flashing the
   * wrong portal); `true`/`false` once known.
   */
  isTeacher: boolean | null;
  signIn: (email: string, password: string) => Promise<void>;
  /** Native Google sign-in → Firebase. No-op (resolves) if the user cancels. */
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isTeacher, setIsTeacher] = useState<boolean | null>(null);

  useEffect(() => {
    // Failsafe: a persisted session whose token refresh can't reach the auth
    // backend (emulator mode with the emulators down, or a device that can't
    // see `localhost`/`10.0.2.2`) can otherwise leave `loading` true forever —
    // pinning the splash. Force it down after a few seconds so the app always
    // proceeds to the login screen instead of freezing.
    const failsafe = setTimeout(() => setLoading(false), 6000);
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      clearTimeout(failsafe);
    });
    return () => {
      clearTimeout(failsafe);
      unsub();
    };
  }, []);

  // Probe the role once a user is known. The teacher dashboard endpoint is
  // owner-gated — it 200s for the teacher who owns the account and 404/403s
  // for everyone else, so it doubles as a cheap "am I a teacher?" check.
  useEffect(() => {
    if (!user) {
      setIsTeacher(null);
      return;
    }
    let cancelled = false;
    setIsTeacher(null);
    // The role probe gates the splash, so it must never leave `isTeacher` at
    // `null`. `apiFetch` has no timeout, so a slow/unreachable API would hang
    // here forever. Default to "not a teacher" after a short wait (the student
    // tabs are the safe fallback); the probe still upgrades to the real answer
    // if/when it lands.
    const timer = setTimeout(() => {
      if (!cancelled) setIsTeacher((cur) => (cur === null ? false : cur));
    }, 5000);
    api
      .teacherDashboard(user.uid)
      .then(() => {
        if (!cancelled) setIsTeacher(true);
      })
      .catch(() => {
        if (!cancelled) setIsTeacher(false);
      })
      .finally(() => clearTimeout(timer));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [user]);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const idToken = await googleSignInIdToken();
    if (!idToken) return; // user cancelled the chooser
    await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
    // onAuthStateChanged picks up the new user.
  }, []);

  const signOut = useCallback(async () => {
    await googleSignOut().catch(() => {});
    await fbSignOut(auth);
  }, []);

  const value = useMemo(
    () => ({ user, loading, isTeacher, signIn, signInWithGoogle, signOut }),
    [user, loading, isTeacher, signIn, signInWithGoogle, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
