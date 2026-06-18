import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetIdToken = vi.fn().mockResolvedValue("test-token");
vi.mock("../../firebase/client", () => ({
    auth: { currentUser: { getIdToken: () => mockGetIdToken() } },
}));

import { assertSlugAvailable } from "../slug";

function jsonRes(body: unknown, ok = true, status = 200): Response {
    return { ok, status, json: async () => body } as unknown as Response;
}

describe("assertSlugAvailable (web / teacher)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal("fetch", vi.fn());
    });

    it("returns the slug the server reserves (and trims the input)", async () => {
        (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonRes({ slug: "my-quiz" }));
        await expect(assertSlugAvailable("quizzes", " my-quiz ")).resolves.toBe("my-quiz");
        const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
            collection: "quizzes",
            slug: "my-quiz",
        });
    });

    it("rejects malformed slugs before calling the server", async () => {
        await expect(assertSlugAvailable("courses", "Bad Slug")).rejects.toThrow(/lowercase letters/i);
        expect(fetch).not.toHaveBeenCalled();
    });

    it("returns the server's auto-suffixed slug on a collision", async () => {
        (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonRes({ slug: "ssc-cgl-2025-2" }));
        await expect(assertSlugAvailable("tests", "ssc-cgl-2025")).resolves.toBe("ssc-cgl-2025-2");
    });

    it("skips the server when editing without changing the slug", async () => {
        await expect(assertSlugAvailable("quizzes", "keep-slug", "keep-slug")).resolves.toBe(
            "keep-slug"
        );
        expect(fetch).not.toHaveBeenCalled();
    });

    it("surfaces the server's error message", async () => {
        (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
            jsonRes({ error: "Could not find a free slug for \"x\"." }, false, 409)
        );
        await expect(assertSlugAvailable("quizzes", "some-slug")).rejects.toThrow(/free slug/i);
    });
});
