import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
    contentDoc: null as Record<string, unknown> | null,
    instituteAdmin: false,
}));

vi.mock("@/lib/firebase/admin", () => ({
    adminDb: {
        collection: () => ({
            doc: () => ({
                get: () =>
                    Promise.resolve({
                        exists: h.contentDoc !== null,
                        data: () => h.contentDoc || {},
                    }),
            }),
        }),
    },
}));

vi.mock("@/lib/server/institutes", () => ({
    isInstituteAdmin: () => Promise.resolve(h.instituteAdmin),
}));

import { callerCanReadAttempt } from "../attemptAccess";

beforeEach(() => {
    h.contentDoc = null;
    h.instituteAdmin = false;
});

describe("callerCanReadAttempt", () => {
    it("allows the attempt owner", async () => {
        expect(
            await callerCanReadAttempt("student1", { userId: "student1" }, { collection: "quizzes", id: "q1" })
        ).toBe(true);
    });

    it("allows the teacher who authored the content", async () => {
        h.contentDoc = { teacherId: "teacher1" };
        expect(
            await callerCanReadAttempt("teacher1", { userId: "student1" }, { collection: "tests", id: "s1" })
        ).toBe(true);
    });

    it("denies an unrelated user even when content exists", async () => {
        h.contentDoc = { teacherId: "teacher1" };
        expect(
            await callerCanReadAttempt("stranger", { userId: "student1" }, { collection: "tests", id: "s1" })
        ).toBe(false);
    });

    it("allows an admin of the content's institute", async () => {
        h.contentDoc = { teacherId: "teacher1", instituteId: "inst1" };
        h.instituteAdmin = true;
        expect(
            await callerCanReadAttempt("instAdmin", { userId: "student1" }, { collection: "quizzes", id: "q1" })
        ).toBe(true);
    });

    it("denies when the content doc is missing", async () => {
        h.contentDoc = null;
        expect(
            await callerCanReadAttempt("teacher1", { userId: "student1" }, { collection: "quizzes", id: "q1" })
        ).toBe(false);
    });

    it("denies when there is no content id on the attempt", async () => {
        expect(
            await callerCanReadAttempt("teacher1", { userId: "student1" }, { collection: "tests", id: null })
        ).toBe(false);
    });
});
