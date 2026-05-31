import { describe, it, expect, vi } from "vitest";

// The scheduling lib imports adminDb (Firebase) + the entitlements module at
// load time. Mock both so we can exercise the pure slot-math functions
// (parsing, window derivation, bookability) without a live Firestore.
vi.mock("@/lib/firebase/admin", () => ({
    // Chainable enough for module-load (CONFIG_DOC = collection().doc()); the
    // pure functions under test never touch Firestore.
    adminDb: {
        collection: vi.fn(() => ({ doc: vi.fn(() => ({ id: "stub" })) })),
        runTransaction: vi.fn(),
        getAll: vi.fn(),
    },
}));
vi.mock("@/lib/server/entitlements", () => ({ refundQuota: vi.fn() }));
// Stub the collection-name consts so importing the scheduling lib doesn't pull
// in aiInterview.ts and its server-only chain (judge, practice, etc.).
vi.mock("@/lib/server/aiInterview", () => ({
    AI_INTERVIEW_SESSIONS: "aiInterviewSessions",
    AI_INTERVIEW_SLOTS: "aiInterviewSlots",
    AI_INTERVIEW_QUOTA: "aiInterviewsPerWeek",
}));

import {
    parseSlotKey,
    slotWindowFor,
    currentSlot,
    validateBookableSlot,
} from "../aiInterviewScheduling";
import { DEFAULT_AI_INTERVIEW_SCHEDULING } from "@digimine/types";

const cfg = DEFAULT_AI_INTERVIEW_SCHEDULING;

describe("parseSlotKey", () => {
    it("round-trips a valid key to its UTC start", () => {
        expect(parseSlotKey("2026-05-31T1430")?.toISOString()).toBe("2026-05-31T14:30:00.000Z");
    });
    it("rejects malformed keys", () => {
        expect(parseSlotKey("nope")).toBeNull();
        expect(parseSlotKey("2026-05-31 14:30")).toBeNull();
        expect(parseSlotKey("")).toBeNull();
    });
});

describe("slotWindowFor / currentSlot", () => {
    it("derives a [start, end) window of slotMinutes length", () => {
        const w = slotWindowFor(new Date(Date.UTC(2026, 4, 31, 14, 42)), cfg);
        expect(w.slotKey).toBe("2026-05-31T1430");
        expect(w.startsAt.toISOString()).toBe("2026-05-31T14:30:00.000Z");
        expect(w.endsAt.toISOString()).toBe("2026-05-31T15:00:00.000Z");
    });
    it("currentSlot contains 'now'", () => {
        const now = new Date(Date.UTC(2026, 4, 31, 14, 42));
        const w = currentSlot(now, cfg);
        expect(w.startsAt <= now && now < w.endsAt).toBe(true);
    });
});

describe("validateBookableSlot", () => {
    const now = new Date(Date.UTC(2026, 4, 31, 14, 42)); // inside the 14:30 slot

    it("accepts a future, grid-aligned slot within the horizon", () => {
        const future = slotWindowFor(new Date(now.getTime() + 60 * 60_000), cfg).slotKey; // +1h
        expect(validateBookableSlot(future, now, cfg)?.slotKey).toBe(future);
    });

    it("accepts the current slot (its window hasn't ended yet)", () => {
        expect(validateBookableSlot("2026-05-31T1430", now, cfg)).not.toBeNull();
    });

    it("rejects a wholly-past slot", () => {
        expect(validateBookableSlot("2026-05-31T1400", now, cfg)).toBeNull();
    });

    it("rejects a non-grid-aligned key", () => {
        // 14:35 is not a 30-minute boundary, so the key won't round-trip.
        expect(validateBookableSlot("2026-05-31T1435", now, cfg)).toBeNull();
    });

    it("rejects a slot beyond the booking horizon", () => {
        const beyond = slotWindowFor(
            new Date(now.getTime() + (cfg.bookingHorizonHours + 2) * 3_600_000),
            cfg
        ).slotKey;
        expect(validateBookableSlot(beyond, now, cfg)).toBeNull();
    });

    it("rejects garbage", () => {
        expect(validateBookableSlot("not-a-slot", now, cfg)).toBeNull();
    });
});
