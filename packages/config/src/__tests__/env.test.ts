import { describe, it, expect, vi } from "vitest";

describe("Environment constants", () => {
  it("IS_DEVELOPMENT is true when NODE_ENV=development", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    vi.resetModules();
    const mod = await import("../env");
    expect(mod.IS_DEVELOPMENT).toBe(true);
    expect(mod.IS_PRODUCTION).toBe(false);
    expect(mod.IS_TEST).toBe(false);
    process.env.NODE_ENV = originalEnv;
  });

  it("IS_PRODUCTION is true when NODE_ENV=production", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    vi.resetModules();
    const mod = await import("../env");
    expect(mod.IS_PRODUCTION).toBe(true);
    expect(mod.IS_DEVELOPMENT).toBe(false);
    process.env.NODE_ENV = originalEnv;
  });

  it("IS_TEST is true when NODE_ENV=test", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";
    vi.resetModules();
    const mod = await import("../env");
    expect(mod.IS_TEST).toBe(true);
    process.env.NODE_ENV = originalEnv;
  });

  it("APP_NAME is PlacementRanker", async () => {
    const mod = await import("../env");
    expect(mod.APP_NAME).toBe("PlacementRanker");
  });

  it("APP_VERSION is defined", async () => {
    const mod = await import("../env");
    expect(mod.APP_VERSION).toBeDefined();
  });

  it("DEFAULT_PAGE_SIZE is 12", async () => {
    const mod = await import("../env");
    expect(mod.DEFAULT_PAGE_SIZE).toBe(12);
  });

  it("MAX_PAGE_SIZE is 100", async () => {
    const mod = await import("../env");
    expect(mod.MAX_PAGE_SIZE).toBe(100);
  });

  it("MAX_FILE_SIZE_MB is 100", async () => {
    const mod = await import("../env");
    expect(mod.MAX_FILE_SIZE_MB).toBe(100);
  });

  it("MAX_FILE_SIZE_BYTES is correct", async () => {
    const mod = await import("../env");
    expect(mod.MAX_FILE_SIZE_BYTES).toBe(100 * 1024 * 1024);
  });

  it("ALLOWED_IMAGE_TYPES contains expected types", async () => {
    const mod = await import("../env");
    expect(mod.ALLOWED_IMAGE_TYPES).toContain("image/jpeg");
    expect(mod.ALLOWED_IMAGE_TYPES).toContain("image/png");
    expect(mod.ALLOWED_IMAGE_TYPES).toContain("image/webp");
  });

  it("ALLOWED_FILE_TYPES contains PDF and ZIP", async () => {
    const mod = await import("../env");
    expect(mod.ALLOWED_FILE_TYPES).toContain("application/pdf");
    expect(mod.ALLOWED_FILE_TYPES).toContain("application/zip");
  });

  it("DEFAULT_CURRENCY is USD", async () => {
    const mod = await import("../env");
    expect(mod.DEFAULT_CURRENCY).toBe("USD");
  });

  it("API_BASE_URL falls back to empty string", async () => {
    const original = process.env.NEXT_PUBLIC_API_BASE_URL;
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    vi.resetModules();
    const mod = await import("../env");
    expect(mod.API_BASE_URL).toBe("");
    if (original) process.env.NEXT_PUBLIC_API_BASE_URL = original;
  });

  it("BUG: IS_CLIENT is computed at import time and may be wrong in test environment", async () => {
    // In Node test environment, typeof window === "undefined" so IS_CLIENT is false
    // This is correct for SSR but can mislead tests that simulate browser env
    const mod = await import("../env");
    expect(mod.IS_CLIENT).toBe(false);
    expect(mod.IS_SERVER).toBe(true);
  });

  it("BUG: no validation on NEXT_PUBLIC_API_BASE_URL format", async () => {
    const original = process.env.NEXT_PUBLIC_API_BASE_URL;
    process.env.NEXT_PUBLIC_API_BASE_URL = "not-a-url";
    vi.resetModules();
    const mod = await import("../env");
    expect(mod.API_BASE_URL).toBe("not-a-url");
    if (original) process.env.NEXT_PUBLIC_API_BASE_URL = original;
  });
});
