import { describe, it, expect } from "vitest";
import type { User, UserRole, OnboardingStep, PurchaseRecord } from "../user";

describe("User type compatibility", () => {
  it("accepts valid User object", () => {
    const user: User = {
      id: "uid123",
      email: "test@example.com",
      displayName: "Test User",
      firstName: "Test",
      lastName: "User",
      phoneNumber: "+911234567890",
      photoURL: "https://example.com/photo.jpg",
      role: "customer",
      onboardingStep: "complete",
      purchases: [],
      testPurchases: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(user.id).toBe("uid123");
  });

  it("accepts null role", () => {
    const user: User = {
      id: "uid123",
      email: "test@example.com",
      displayName: null,
      firstName: null,
      lastName: null,
      phoneNumber: null,
      photoURL: null,
      role: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(user.role).toBeNull();
  });

  it("accepts all valid UserRole values", () => {
    const roles: UserRole[] = ["customer", "admin", "super_admin", "teacher", "institute_admin"];
    expect(roles).toHaveLength(5);
  });

  it("accepts all OnboardingStep values", () => {
    const steps: OnboardingStep[] = [
      "teacher:phone",
      "teacher:payment",
      "teacher:profile",
      "institute:phone",
      "institute:setup",
      "complete",
    ];
    expect(steps).toHaveLength(6);
  });

  it("PurchaseRecord accepts null expiresAt", () => {
    const record: PurchaseRecord = {
      productId: "prod123",
      purchasedAt: new Date(),
      expiresAt: null,
    };
    expect(record.expiresAt).toBeNull();
  });

  it("PurchaseRecord accepts Date expiresAt", () => {
    const record: PurchaseRecord = {
      productId: "prod123",
      purchasedAt: new Date(),
      expiresAt: new Date("2025-01-01"),
    };
    expect(record.expiresAt).toBeInstanceOf(Date);
  });

  it("BUG: User type allows empty string for id", () => {
    const user: User = {
      id: "",
      email: "test@example.com",
      displayName: null,
      firstName: null,
      lastName: null,
      phoneNumber: null,
      photoURL: null,
      role: "customer",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(user.id).toBe("");
  });

  it("BUG: User type allows invalid email format", () => {
    const user: User = {
      id: "uid123",
      email: "not-an-email",
      displayName: null,
      firstName: null,
      lastName: null,
      phoneNumber: null,
      photoURL: null,
      role: "customer",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(user.email).toBe("not-an-email");
  });
});
