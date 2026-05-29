import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDoc = { get: vi.fn() };
const mockCollection = { doc: vi.fn(() => mockDoc) };

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: { collection: vi.fn(() => mockCollection) },
}));

import { requireAssignedRole } from "../roleGate";

describe("requireAssignedRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns role when user has a role", async () => {
    mockDoc.get.mockResolvedValue({ data: () => ({ role: "teacher" }) });
    const result = await requireAssignedRole("user123");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.role).toBe("teacher");
  });

  it("returns 403 when user has no role", async () => {
    mockDoc.get.mockResolvedValue({ data: () => ({ role: null }) });
    const result = await requireAssignedRole("user123");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const body = await result.response.json();
      expect(body.code).toBe("role_required");
      expect(body.redirectTo).toBe("/role-select");
    }
  });

  it("returns 403 when role field is missing", async () => {
    mockDoc.get.mockResolvedValue({ data: () => ({}) });
    const result = await requireAssignedRole("user123");
    expect(result.ok).toBe(false);
  });

  it("returns 403 when document doesn't exist", async () => {
    mockDoc.get.mockResolvedValue({ data: () => undefined });
    const result = await requireAssignedRole("user123");
    expect(result.ok).toBe(false);
  });

  it("returns 500 when DB throws", async () => {
    mockDoc.get.mockRejectedValue(new Error("DB down"));
    const result = await requireAssignedRole("user123");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(500);
  });

  it("BUG: does not validate userId format", async () => {
    mockDoc.get.mockResolvedValue({ data: () => ({ role: "admin" }) });
    const result = await requireAssignedRole("");
    expect(result.ok).toBe(true);
  });

  it("BUG: role '   ' (whitespace) is treated as truthy", async () => {
    mockDoc.get.mockResolvedValue({ data: () => ({ role: "   " }) });
    const result = await requireAssignedRole("user123");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.role).toBe("   ");
  });
});
