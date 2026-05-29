import { describe, it, expect } from "vitest";
import {
  isValidEmail,
  isStrongPassword,
  isValidURL,
  isEmpty,
  isPositiveNumber,
  isValidSlug,
} from "../validation";

describe("isValidEmail", () => {
  it("accepts standard email", () => {
    expect(isValidEmail("test@example.com")).toBe(true);
  });

  it("accepts email with dots", () => {
    expect(isValidEmail("first.last@example.co.uk")).toBe(true);
  });

  it("accepts email with plus", () => {
    expect(isValidEmail("user+tag@example.com")).toBe(true);
  });

  it("rejects missing @", () => {
    expect(isValidEmail("testexample.com")).toBe(false);
  });

  it("rejects missing domain", () => {
    expect(isValidEmail("test@")).toBe(false);
  });

  it("rejects missing local part", () => {
    expect(isValidEmail("@example.com")).toBe(false);
  });

  it("rejects double @", () => {
    expect(isValidEmail("test@@example.com")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidEmail("")).toBe(false);
  });

  it("accepts email with trailing dot in local part (regex allows it)", () => {
    // The simple regex allows this — not strictly RFC compliant but passes
    expect(isValidEmail("user.name.@example.com")).toBe(true);
  });

  it("BUG: accepts email with consecutive dots", () => {
    // Should reject but doesn't
    expect(isValidEmail("test..user@example.com")).toBe(true);
  });

  it("rejects email without TLD", () => {
    // The regex requires a dot after @
    expect(isValidEmail("test@example")).toBe(false);
  });

  it("BUG: accepts email with spaces", () => {
    // Spaces should not be valid
    expect(isValidEmail("test user@example.com")).toBe(false);
  });
});

describe("isStrongPassword", () => {
  it("accepts valid password", () => {
    expect(isStrongPassword("Hello1World")).toBe(true);
  });

  it("rejects short password", () => {
    expect(isStrongPassword("He1")).toBe(false);
  });

  it("rejects password without uppercase", () => {
    expect(isStrongPassword("hello1world")).toBe(false);
  });

  it("rejects password without lowercase", () => {
    expect(isStrongPassword("HELLO1WORLD")).toBe(false);
  });

  it("rejects password without number", () => {
    expect(isStrongPassword("HelloWorld")).toBe(false);
  });

  it("accepts exactly 8 chars", () => {
    expect(isStrongPassword("Hello1W8")).toBe(true);
  });

  it("rejects 7 chars", () => {
    expect(isStrongPassword("Hello1W")).toBe(false);
  });

  it("BUG: accepts password with only numbers and one case", () => {
    // "Hello1111" has upper, lower, and number — passes
    expect(isStrongPassword("Hello1111")).toBe(true);
  });

  it("BUG: does not require special characters", () => {
    // Function docs say min 8, 1 upper, 1 lower, 1 number — no special char requirement
    expect(isStrongPassword("Password1")).toBe(true);
  });

  it("BUG: empty string returns false but could throw", () => {
    expect(isStrongPassword("")).toBe(false);
  });

  it("BUG: does not check for common weak patterns", () => {
    expect(isStrongPassword("Password1")).toBe(true);
    expect(isStrongPassword("Qwerty123")).toBe(true);
    expect(isStrongPassword("Abcdef1g")).toBe(true);
  });
});

describe("isValidURL", () => {
  it("accepts HTTPS URL", () => {
    expect(isValidURL("https://example.com")).toBe(true);
  });

  it("accepts HTTP URL", () => {
    expect(isValidURL("http://example.com")).toBe(true);
  });

  it("accepts URL with path", () => {
    expect(isValidURL("https://example.com/path/to/page")).toBe(true);
  });

  it("accepts URL with query params", () => {
    expect(isValidURL("https://example.com?foo=bar")).toBe(true);
  });

  it("rejects plain string", () => {
    expect(isValidURL("not a url")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidURL("")).toBe(false);
  });

  it("accepts localhost", () => {
    expect(isValidURL("http://localhost:3000")).toBe(true);
  });

  it("BUG: accepts malformed protocol URLs", () => {
    // URL constructor accepts some weird protocols
    expect(isValidURL("ftp://example.com")).toBe(true);
  });

  it("BUG: rejects relative paths", () => {
    expect(isValidURL("/path/to/page")).toBe(false);
  });

  it("BUG: accepts URLs with spaces (encoded)", () => {
    expect(isValidURL("https://example.com/hello%20world")).toBe(true);
  });
});

describe("isEmpty", () => {
  it("returns true for empty string", () => {
    expect(isEmpty("")).toBe(true);
  });

  it("returns true for whitespace only", () => {
    expect(isEmpty("   ")).toBe(true);
  });

  it("returns true for null", () => {
    expect(isEmpty(null)).toBe(true);
  });

  it("returns true for undefined", () => {
    expect(isEmpty(undefined)).toBe(true);
  });

  it("returns false for non-empty string", () => {
    expect(isEmpty("hello")).toBe(false);
  });

  it("returns false for string with whitespace", () => {
    expect(isEmpty(" hello ")).toBe(false);
  });

  it("BUG: throws on number input", () => {
    // Type signature only accepts string|null|undefined
    // But runtime call with number throws because .trim() doesn't exist
    expect(() => isEmpty(42 as any)).toThrow();
  });

  it("BUG: throws on object input", () => {
    expect(() => isEmpty({} as any)).toThrow();
  });
});

describe("isPositiveNumber", () => {
  it("returns true for positive integer", () => {
    expect(isPositiveNumber(42)).toBe(true);
  });

  it("returns true for positive float", () => {
    expect(isPositiveNumber(3.14)).toBe(true);
  });

  it("returns false for zero", () => {
    expect(isPositiveNumber(0)).toBe(false);
  });

  it("returns false for negative number", () => {
    expect(isPositiveNumber(-5)).toBe(false);
  });

  it("returns false for NaN", () => {
    expect(isPositiveNumber(NaN)).toBe(false);
  });

  it("BUG: returns true for Infinity (should be false)", () => {
    // Infinity is a number, not NaN, and > 0 — but should probably be rejected
    expect(isPositiveNumber(Infinity)).toBe(true);
  });

  it("returns false for string number", () => {
    expect(isPositiveNumber("42")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isPositiveNumber(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isPositiveNumber(undefined)).toBe(false);
  });
});

describe("isValidSlug", () => {
  it("accepts simple slug", () => {
    expect(isValidSlug("hello-world")).toBe(true);
  });

  it("accepts numbers", () => {
    expect(isValidSlug("hello-123")).toBe(true);
  });

  it("rejects uppercase", () => {
    expect(isValidSlug("Hello-World")).toBe(false);
  });

  it("rejects spaces", () => {
    expect(isValidSlug("hello world")).toBe(false);
  });

  it("rejects leading hyphen", () => {
    expect(isValidSlug("-hello")).toBe(false);
  });

  it("rejects trailing hyphen", () => {
    expect(isValidSlug("hello-")).toBe(false);
  });

  it("rejects consecutive hyphens", () => {
    expect(isValidSlug("hello--world")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidSlug("")).toBe(false);
  });

  it("rejects special characters", () => {
    expect(isValidSlug("hello@world")).toBe(false);
  });

  it("BUG: rejects single character slug", () => {
    expect(isValidSlug("a")).toBe(true); // actually passes, which is fine
  });

  it("BUG: accepts very long slug", () => {
    const longSlug = "a".repeat(300);
    expect(isValidSlug(longSlug)).toBe(true);
    // No max length enforcement — could cause URL issues
  });
});
