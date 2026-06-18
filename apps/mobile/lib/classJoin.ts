/**
 * Shared "join a class by code" flow, used by both the manual code entry on the
 * Classes screen and the QR scanner. Looks up the invite, confirms with the user
 * (a CLS- code = one class, a GRP- code = a whole section), enrolls, and reports
 * the class to land in.
 */
import { Alert } from "react-native";
import { api, ApiError } from "./api";

export type JoinHandlers = {
  code: string;
  email?: string | null;
  name?: string | null;
  /** Called with the class id to navigate to after a successful join. */
  onJoined: (classId: string) => void;
  /** Called with a human message on lookup/join failure. */
  onError: (message: string) => void;
  /** Optional: user dismissed the confirm dialog (re-enable a scanner, etc.). */
  onCancel?: () => void;
  /** Optional: refresh the enrolled list before navigating. */
  onRefresh?: () => Promise<void> | void;
};

/** Pull a class/group invite code out of a scanned QR payload. Accepts a full
 *  join URL (`https://…/join/<code>` or `placementranker://join/<code>`) or a
 *  raw code. Returns null if nothing code-like is found. */
export function extractInviteCode(scanned: string): string | null {
  const s = (scanned || "").trim();
  if (!s) return null;
  const urlMatch = s.match(/\/join\/([^/?#\s]+)/i);
  if (urlMatch) return decodeURIComponent(urlMatch[1]).trim();
  // Bare code: letters/digits/hyphen, e.g. CLS-AB12CD34 or GRP-… or ABX4T9.
  if (/^[A-Za-z0-9][A-Za-z0-9-]{3,}$/.test(s)) return s;
  return null;
}

export async function joinByCode(h: JoinHandlers): Promise<void> {
  const trimmed = h.code.trim();
  if (!trimmed) return;

  const doJoin = async () => {
    try {
      const res = await api.joinClass({
        inviteCode: trimmed,
        studentEmail: h.email || undefined,
        studentName: h.name || undefined,
      });
      await h.onRefresh?.();
      const firstClass = res.classId || res.classIds?.[0];
      if (firstClass) h.onJoined(firstClass);
    } catch (e: any) {
      if (e instanceof ApiError && e.body?.code === "email_not_verified") {
        h.onError("Verify your email first (check your inbox), then try joining again.");
      } else {
        h.onError(e?.message || "Couldn't join the class.");
      }
    }
  };

  try {
    const found = await api.lookupInvite(trimmed);

    if (found.group) {
      const g = found.group;
      const subjects = g.subjects?.length ? `\n\nSubjects: ${g.subjects.join(", ")}` : "";
      Alert.alert(
        `Join ${g.sectionName || g.name}?`,
        `Group ${g.name} · ${g.classCount} ${g.classCount === 1 ? "class" : "classes"}.${subjects}`,
        [
          { text: "Cancel", style: "cancel", onPress: h.onCancel },
          { text: "Join", onPress: doJoin },
        ]
      );
      return;
    }

    if (found.class) {
      const teacherName =
        found.teacher?.profile?.fullName || found.teacher?.profile?.displayName || "your teacher";
      Alert.alert(
        `Join "${found.class.name}"?`,
        `Taught by ${teacherName}. You'll see its quizzes, courses and discussions here.`,
        [
          { text: "Cancel", style: "cancel", onPress: h.onCancel },
          { text: "Join class", onPress: doJoin },
        ]
      );
      return;
    }

    h.onError("No class or group matches that code — double-check it with your teacher.");
  } catch (e: any) {
    h.onError(e?.message || "Couldn't look up that code.");
  }
}
