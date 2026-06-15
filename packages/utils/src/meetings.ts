/**
 * Pure validation for weekly class-meeting (timetable) rows submitted by the
 * client. Dependency-free so it's unit-testable; server libs re-export it.
 * Drops anything malformed (unknown day, bad HH:mm, end ≤ start), clamps the
 * room string, and caps the number of rows.
 */
export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface Meeting {
    day: Weekday;
    /** "HH:mm", 24-hour. */
    startTime: string;
    /** "HH:mm", 24-hour. */
    endTime: string;
    room: string | null;
}

const WEEKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_MEETINGS = 30;
const MAX_ROOM_LEN = 40;

export function sanitizeMeetings(input: unknown): Meeting[] {
    if (!Array.isArray(input)) return [];
    const out: Meeting[] = [];
    for (const m of input) {
        const row = (m ?? {}) as Record<string, unknown>;
        const day = String(row.day ?? "").toLowerCase() as Weekday;
        const startTime = String(row.startTime ?? "");
        const endTime = String(row.endTime ?? "");
        if (!WEEKDAYS.includes(day) || !TIME_RE.test(startTime) || !TIME_RE.test(endTime)) continue;
        if (endTime <= startTime) continue;
        out.push({
            day,
            startTime,
            endTime,
            room: row.room ? String(row.room).slice(0, MAX_ROOM_LEN) : null,
        });
        if (out.length >= MAX_MEETINGS) break;
    }
    return out;
}
