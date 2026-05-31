import { describe, it, expect } from "vitest";
import {
    interviewSlotKey,
    interviewSlotStart,
    DEFAULT_AI_INTERVIEW_SCHEDULING,
    AI_INTERVIEW_ACTIVE_STATUSES,
} from "../aiInterview";

describe("interviewSlotKey / interviewSlotStart", () => {
    const SLOT = 30;

    it("aligns any instant down to the containing 30-minute grid slot (UTC)", () => {
        // 14:42 → 14:30 slot.
        const d = new Date(Date.UTC(2026, 4, 31, 14, 42, 17, 500));
        expect(interviewSlotKey(d, SLOT)).toBe("2026-05-31T1430");
        expect(interviewSlotStart(d, SLOT).toISOString()).toBe("2026-05-31T14:30:00.000Z");
    });

    it("keeps an exactly-aligned instant in its own slot", () => {
        const d = new Date(Date.UTC(2026, 4, 31, 15, 0, 0));
        expect(interviewSlotKey(d, SLOT)).toBe("2026-05-31T1500");
    });

    it("is stable — same instant always yields the same key (safe as a doc id)", () => {
        const d = new Date(Date.UTC(2026, 0, 1, 9, 7));
        expect(interviewSlotKey(d, SLOT)).toBe(interviewSlotKey(d, SLOT));
    });

    it("two instants in the same window collapse to one key (capacity is shared)", () => {
        const a = new Date(Date.UTC(2026, 4, 31, 14, 31));
        const b = new Date(Date.UTC(2026, 4, 31, 14, 59, 59));
        expect(interviewSlotKey(a, SLOT)).toBe(interviewSlotKey(b, SLOT));
    });

    it("adjacent windows get distinct keys", () => {
        const a = new Date(Date.UTC(2026, 4, 31, 14, 59));
        const b = new Date(Date.UTC(2026, 4, 31, 15, 1));
        expect(interviewSlotKey(a, SLOT)).not.toBe(interviewSlotKey(b, SLOT));
    });

    it("honours a non-default slot length", () => {
        const d = new Date(Date.UTC(2026, 4, 31, 14, 42));
        expect(interviewSlotKey(d, 15)).toBe("2026-05-31T1430");
        expect(interviewSlotKey(d, 60)).toBe("2026-05-31T1400");
    });
});

describe("scheduling defaults", () => {
    it("ship sane, infra-protecting defaults", () => {
        const d = DEFAULT_AI_INTERVIEW_SCHEDULING;
        expect(d.slotCapacity).toBeGreaterThan(0);
        // Slot must be longer than the typical interview so a session fits one window.
        expect(d.slotMinutes).toBeGreaterThanOrEqual(20);
        expect(d.maxRuntimeMin).toBeGreaterThan(d.slotMinutes);
        expect(AI_INTERVIEW_ACTIVE_STATUSES).toEqual(["scheduled", "in_progress"]);
    });
});
