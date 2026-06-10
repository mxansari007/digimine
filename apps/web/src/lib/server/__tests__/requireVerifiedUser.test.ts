import { describe, it, expect, beforeEach, vi } from "vitest";

const mockVerify = vi.fn();
vi.mock("@/lib/firebase/admin", () => ({
    adminAuth: { verifyIdToken: (t: string) => mockVerify(t) },
    adminDb: {},
}));

import { requireVerifiedUser } from "../classroomAccess";

function reqWith(authHeader?: string): Request {
    return new Request("http://localhost/api/x", {
        method: "POST",
        headers: authHeader ? { authorization: authHeader } : {},
    });
}

describe("requireVerifiedUser", () => {
    beforeEach(() => vi.clearAllMocks());

    it("401s when no bearer token is present", async () => {
        const r = await requireVerifiedUser(reqWith());
        expect(r).toEqual({ ok: false, status: 401, error: expect.any(String) });
        expect(mockVerify).not.toHaveBeenCalled();
    });

    it("401s when the token fails to verify", async () => {
        mockVerify.mockRejectedValue(new Error("bad token"));
        const r = await requireVerifiedUser(reqWith("Bearer xyz"));
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.status).toBe(401);
    });

    it("allows a verified email account", async () => {
        mockVerify.mockResolvedValue({ uid: "u1", email: "a@b.com", email_verified: true });
        const r = await requireVerifiedUser(reqWith("Bearer t"));
        expect(r).toEqual({ ok: true, userId: "u1" });
    });

    it("403 email_unverified when the email is not verified", async () => {
        mockVerify.mockResolvedValue({ uid: "u1", email: "a@b.com", email_verified: false });
        const r = await requireVerifiedUser(reqWith("Bearer t"));
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.status).toBe(403);
            expect(r.code).toBe("email_unverified");
        }
    });

    it("treats a missing email_verified claim as unverified (fail closed)", async () => {
        mockVerify.mockResolvedValue({ uid: "u1", email: "a@b.com" });
        const r = await requireVerifiedUser(reqWith("Bearer t"));
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe("email_unverified");
    });

    it("allows phone-only accounts that have no email to verify", async () => {
        mockVerify.mockResolvedValue({ uid: "u1", email: undefined, email_verified: false });
        const r = await requireVerifiedUser(reqWith("Bearer t"));
        expect(r).toEqual({ ok: true, userId: "u1" });
    });
});
