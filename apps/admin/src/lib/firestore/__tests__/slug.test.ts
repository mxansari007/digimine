import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Firestore primitives — doc() just echoes the path, getDoc() is driven
// per-test. The real @digimine/utils isValidSlug runs (aliased in vitest.config).
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

describe("assertSlugAvailable (admin)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetDoc.mockResolvedValue(existing(false));
    });

    it("returns the trimmed slug when free and well-formed", async () => {
        await expect(assertSlugAvailable("quizzes", "  data-structures-101  ")).resolves.toBe(
            "data-structures-101"
        );
        expect(mockGetDoc).toHaveBeenCalledTimes(1);
    });

    it("rejects an empty slug without hitting Firestore", async () => {
        await expect(assertSlugAvailable("courses", "  ")).rejects.toThrow(/slug is required/i);
        expect(mockGetDoc).not.toHaveBeenCalled();
    });

    it("rejects malformed slugs (uppercase, spaces, symbols, double hyphens)", async () => {
        for (const bad of ["Hello-World", "hello world", "hello@world", "hello--world", "-x", "x-"]) {
            await expect(assertSlugAvailable("tests", bad)).rejects.toThrow(/lowercase letters/i);
        }
        expect(mockGetDoc).not.toHaveBeenCalled();
    });

    it("rejects a slug already taken by another document", async () => {
        mockGetDoc.mockResolvedValue(existing(true));
        await expect(assertSlugAvailable("quizzes", "arrays-basics")).rejects.toThrow(
            /already used by another quiz/i
        );
    });

    it("allows an edit to keep its own slug without a uniqueness query", async () => {
        await expect(
            assertSlugAvailable("courses", "intro-to-sql", "intro-to-sql")
        ).resolves.toBe("intro-to-sql");
        expect(mockGetDoc).not.toHaveBeenCalled();
    });

    it("uses the per-collection label in the collision message", async () => {
        mockGetDoc.mockResolvedValue(existing(true));
        await expect(assertSlugAvailable("tests", "ssc-mock-1")).rejects.toThrow(
            /test series/i
        );
    });
});
