import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetDoc = vi.fn();
vi.mock("firebase/firestore", () => ({
    doc: (_db: unknown, col: string, id: string) => ({ col, id }),
    getDoc: (ref: unknown) => mockGetDoc(ref),
}));

vi.mock("../../firebase/client", () => ({ db: {} }));

import { assertSlugAvailable } from "../slug";

function existing(exists: boolean) {
    return { exists: () => exists };
}

describe("assertSlugAvailable (web / teacher)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetDoc.mockResolvedValue(existing(false));
    });

    it("returns the trimmed slug when free and well-formed", async () => {
        await expect(assertSlugAvailable("quizzes", " my-quiz ")).resolves.toBe("my-quiz");
    });

    it("rejects malformed slugs before querying", async () => {
        await expect(assertSlugAvailable("courses", "Bad Slug")).rejects.toThrow(
            /lowercase letters/i
        );
        expect(mockGetDoc).not.toHaveBeenCalled();
    });

    it("rejects a slug taken by a readable document", async () => {
        mockGetDoc.mockResolvedValue(existing(true));
        await expect(assertSlugAvailable("tests", "ssc-cgl-2025")).rejects.toThrow(
            /already taken/i
        );
    });

    it("treats permission-denied (another author's private draft) as taken", async () => {
        // A teacher cannot read another teacher's private doc — Firestore
        // throws permission-denied. The helper must surface a friendly
        // "already taken" rather than letting the cryptic error escape.
        mockGetDoc.mockRejectedValue({ code: "permission-denied" });
        await expect(assertSlugAvailable("quizzes", "shared-slug")).rejects.toThrow(
            /already taken/i
        );
    });

    it("re-throws unexpected Firestore errors unchanged", async () => {
        mockGetDoc.mockRejectedValue(new Error("network down"));
        await expect(assertSlugAvailable("quizzes", "some-slug")).rejects.toThrow(
            /network down/i
        );
    });
});
