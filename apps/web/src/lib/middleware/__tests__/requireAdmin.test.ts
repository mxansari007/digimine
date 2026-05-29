import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

const mockVerifyIdToken = vi.fn();
const mockGetAuth = vi.fn(() => ({ verifyIdToken: mockVerifyIdToken }));

const mockDoc = { get: vi.fn() };
const mockCollection = { doc: vi.fn(() => mockDoc) };

vi.mock("firebase-admin/auth", () => ({
  getAuth: mockGetAuth,
}));

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: { collection: vi.fn(() => mockCollection) },
}));

import { requireAdmin } from "../requireAdmin";

function makeRequest(authHeader?: string): NextRequest {
  return new NextRequest("http://localhost/api/admin/test", {
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

describe("requireAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no auth header", async () => {
    const result = await requireAdmin(makeRequest());
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
  });

  it("returns 401 when auth header doesn't start with Bearer", async () => {
    const result = await requireAdmin(makeRequest("Basic abc"));
    expect((result as Response).status).toBe(401);
  });

  it("returns 401 for invalid token", async () => {
    mockVerifyIdToken.mockRejectedValue(new Error("invalid"));
    const result = await requireAdmin(makeRequest("Bearer badtoken"));
    expect((result as Response).status).toBe(401);
  });

  it("returns 403 when user not found", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: "uid123" });
    mockDoc.get.mockResolvedValue({ exists: false });

    const result = await requireAdmin(makeRequest("Bearer validtoken"));
    expect((result as Response).status).toBe(403);
  });

  it("returns 403 for non-admin role", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: "uid123" });
    mockDoc.get.mockResolvedValue({ exists: true, data: () => ({ role: "customer" }) });

    const result = await requireAdmin(makeRequest("Bearer validtoken"));
    expect((result as Response).status).toBe(403);
  });

  it("returns uid and role for admin", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: "uid123" });
    mockDoc.get.mockResolvedValue({ exists: true, data: () => ({ role: "admin" }) });

    const result = await requireAdmin(makeRequest("Bearer validtoken"));
    expect(result).toEqual({ uid: "uid123", role: "admin" });
  });

  it("returns uid and role for super_admin", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: "uid123" });
    mockDoc.get.mockResolvedValue({ exists: true, data: () => ({ role: "super_admin" }) });

    const result = await requireAdmin(makeRequest("Bearer validtoken"));
    expect(result).toEqual({ uid: "uid123", role: "super_admin" });
  });

  it("BUG: accepts empty Bearer token", async () => {
    mockVerifyIdToken.mockRejectedValue(new Error("invalid"));
    const result = await requireAdmin(makeRequest("Bearer "));
    expect((result as Response).status).toBe(401);
  });

  it("BUG: does not check token expiry explicitly", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: "uid123" });
    mockDoc.get.mockResolvedValue({ exists: true, data: () => ({ role: "admin" }) });

    const result = await requireAdmin(makeRequest("Bearer oldtoken"));
    expect(result).toEqual({ uid: "uid123", role: "admin" });
  });
});
