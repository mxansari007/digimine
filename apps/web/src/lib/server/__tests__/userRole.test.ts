import { describe, it, expect, vi } from "vitest";

const mockDoc = { get: vi.fn() };
const mockCollection = { doc: vi.fn(() => mockDoc) };

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: { collection: vi.fn(() => mockCollection) },
}));

import { getUserRole, isPreviewRole, previewAttemptOverlay } from "../userRole";

describe("getUserRole", () => {
  it("returns role when user exists", async () => {
    mockDoc.get.mockResolvedValue({ exists: true, data: () => ({ role: "teacher" }) });
    const role = await getUserRole("user123");
    expect(role).toBe("teacher");
  });

  it("returns null for empty userId", async () => {
    const role = await getUserRole("");
    expect(role).toBeNull();
  });

  it("returns null when user not found", async () => {
    mockDoc.get.mockResolvedValue({ exists: false, data: () => null });
    const role = await getUserRole("unknown");
    expect(role).toBeNull();
  });

  it("returns null when role field missing", async () => {
    mockDoc.get.mockResolvedValue({ exists: true, data: () => ({}) });
    const role = await getUserRole("user123");
    expect(role).toBeNull();
  });

  it("BUG: does not validate userId format", async () => {
    mockDoc.get.mockResolvedValue({ exists: true, data: () => ({ role: "admin" }) });
    const role = await getUserRole("   ");
    expect(role).toBe("admin");
  });
});

describe("isPreviewRole", () => {
  it("returns false for customer", () => {
    expect(isPreviewRole("customer")).toBe(false);
  });

  it("returns true for teacher", () => {
    expect(isPreviewRole("teacher")).toBe(true);
  });

  it("returns true for admin", () => {
    expect(isPreviewRole("admin")).toBe(true);
  });

  it("returns true for super_admin", () => {
    expect(isPreviewRole("super_admin")).toBe(true);
  });

  it("returns true for institute_admin", () => {
    expect(isPreviewRole("institute_admin")).toBe(true);
  });

  it("returns false for null", () => {
    expect(isPreviewRole(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isPreviewRole(undefined)).toBe(false);
  });

  it("BUG: returns false for unknown role string", () => {
    // Any string not equal to "customer" returns true
    expect(isPreviewRole("hacker" as any)).toBe(true);
  });
});

describe("previewAttemptOverlay", () => {
  it("returns null for customer", async () => {
    mockDoc.get.mockResolvedValue({ exists: true, data: () => ({ role: "customer" }) });
    const overlay = await previewAttemptOverlay("user123");
    expect(overlay).toBeNull();
  });

  it("returns overlay for teacher", async () => {
    mockDoc.get.mockResolvedValue({ exists: true, data: () => ({ role: "teacher" }) });
    const overlay = await previewAttemptOverlay("user123");
    expect(overlay).toEqual({ isPreview: true, attemptedAs: "teacher" });
  });

  it("returns null for null role", async () => {
    mockDoc.get.mockResolvedValue({ exists: true, data: () => ({}) });
    const overlay = await previewAttemptOverlay("user123");
    expect(overlay).toBeNull();
  });
});
