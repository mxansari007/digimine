import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import {
  formatCurrency,
  formatDate,
  formatRelativeTime,
  formatFileSize,
  truncateText,
  slugify,
} from "../format";

describe("formatCurrency", () => {
  it("formats INR correctly", () => {
    const result = formatCurrency(1000, "INR", "en-IN");
    expect(result).toContain("₹");
    expect(result).toContain("1,000");
  });

  it("formats USD correctly", () => {
    const result = formatCurrency(99.99, "USD", "en-US");
    expect(result).toContain("$");
    expect(result).toContain("99.99");
  });

  it("defaults to INR when currency not specified", () => {
    const result = formatCurrency(500);
    expect(result).toContain("₹");
  });

  it("handles zero amount", () => {
    const result = formatCurrency(0);
    expect(result).toContain("0");
  });

  it("handles negative amounts", () => {
    const result = formatCurrency(-100, "INR");
    expect(result).toContain("-");
    expect(result).toContain("100");
  });

  it("handles very large amounts", () => {
    const result = formatCurrency(10000000, "INR");
    expect(result).toContain("1,00,00,000");
  });

  it("BUG: returns '₹NaN' for NaN input", () => {
    // The function does not validate input — passing NaN propagates to Intl
    expect(formatCurrency(NaN)).toBe("₹NaN");
  });

  it("BUG: returns '₹∞' for Infinity input", () => {
    expect(formatCurrency(Infinity)).toBe("₹∞");
  });
});

describe("formatDate", () => {
  it("formats a Date object", () => {
    const d = new Date("2024-03-15");
    const result = formatDate(d);
    expect(result).toContain("2024");
    expect(result).toContain("15");
  });

  it("formats an ISO string", () => {
    const result = formatDate("2024-03-15T00:00:00Z");
    expect(result).toContain("2024");
  });

  it("accepts custom options", () => {
    const result = formatDate("2024-03-15", { month: "short", day: "numeric" });
    expect(result).toContain("Mar");
  });

  it("BUG: returns 'Invalid Date' for malformed string", () => {
    // No validation — bad input produces RangeError from Intl
    expect(() => formatDate("not-a-date")).toThrow();
  });

  it("BUG: returns 'Invalid Date' for empty string", () => {
    expect(() => formatDate("")).toThrow();
  });
});

describe("formatRelativeTime", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T12:00:00Z"));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("returns 'seconds ago' for recent dates", () => {
    const d = new Date(Date.now() - 30 * 1000);
    const result = formatRelativeTime(d);
    expect(result).toMatch(/second/);
  });

  it("returns 'minutes ago' for dates a few minutes back", () => {
    const d = new Date(Date.now() - 5 * 60 * 1000);
    const result = formatRelativeTime(d);
    expect(result).toMatch(/minute/);
  });

  it("returns 'hours ago' for dates a few hours back", () => {
    const d = new Date(Date.now() - 3 * 3600 * 1000);
    const result = formatRelativeTime(d);
    expect(result).toMatch(/hour/);
  });

  it("returns 'days ago' for dates a few days back", () => {
    const d = new Date(Date.now() - 2 * 86400 * 1000);
    const result = formatRelativeTime(d);
    expect(result).toMatch(/day/);
  });

  it("returns 'months ago' for dates a few months back", () => {
    const d = new Date(Date.now() - 45 * 86400 * 1000);
    const result = formatRelativeTime(d);
    expect(result).toMatch(/month/);
  });

  it("returns 'years ago' for dates a year back", () => {
    const d = new Date(Date.now() - 400 * 86400 * 1000);
    const result = formatRelativeTime(d);
    expect(result).toMatch(/year/);
  });

  it("BUG: future dates produce negative relative strings", () => {
    const future = new Date(Date.now() + 86400 * 1000);
    const result = formatRelativeTime(future);
    // Future dates show "in X seconds" which is actually correct Intl behavior
    // but may be unexpected if the UI assumes all inputs are past dates
    expect(result).toMatch(/in /);
  });
});

describe("formatFileSize", () => {
  it("returns '0 Bytes' for 0", () => {
    expect(formatFileSize(0)).toBe("0 Bytes");
  });

  it("formats bytes", () => {
    expect(formatFileSize(512)).toBe("512 Bytes");
  });

  it("formats KB", () => {
    expect(formatFileSize(1536)).toBe("1.5 KB");
  });

  it("formats MB", () => {
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5 MB");
  });

  it("formats GB", () => {
    expect(formatFileSize(2 * 1024 * 1024 * 1024)).toBe("2 GB");
  });

  it("BUG: returns '-Infinity Bytes' for negative input", () => {
    // No guard against negative numbers — Math.log of negative is NaN
    const result = formatFileSize(-1);
    expect(result).toSatisfy((r: string) => r.includes("NaN") || r.includes("Infinity"));
  });
});

describe("truncateText", () => {
  it("returns original text if shorter than maxLength", () => {
    expect(truncateText("hello", 10)).toBe("hello");
  });

  it("truncates long text with ellipsis", () => {
    expect(truncateText("hello world", 8)).toBe("hello...");
  });

  it("handles exact length", () => {
    expect(truncateText("hello", 5)).toBe("hello");
  });

  it("handles empty string", () => {
    expect(truncateText("", 5)).toBe("");
  });

  it("BUG: returns malformed output when maxLength < 4", () => {
    // When maxLength <= 3, slice(0, maxLength - 3) becomes slice(0, 0) or negative index
    // Negative indices slice from end, producing unexpected long outputs
    expect(truncateText("hello", 3)).toBe("...");      // slice(0,0) + "..." = "..."
    expect(truncateText("hello", 2)).toBe("hell...");  // slice(0,-1) + "..." = "hell..." (7 chars!)
  });
});

describe("slugify", () => {
  it("converts to lowercase", () => {
    expect(slugify("HELLO WORLD")).toBe("hello-world");
  });

  it("replaces spaces with hyphens", () => {
    expect(slugify("hello world")).toBe("hello-world");
  });

  it("removes special characters", () => {
    expect(slugify("hello@world!")).toBe("helloworld");
  });

  it("trims leading/trailing hyphens", () => {
    expect(slugify("-hello world-")).toBe("hello-world");
  });

  it("handles multiple spaces", () => {
    expect(slugify("hello   world")).toBe("hello-world");
  });

  it("handles empty string", () => {
    expect(slugify("")).toBe("");
  });

  it("handles underscores", () => {
    expect(slugify("hello_world")).toBe("hello-world");
  });

  it("BUG: returns empty string for input with only special chars", () => {
    expect(slugify("@#$%")).toBe("");
  });

  it("BUG: consecutive hyphens are collapsed correctly", () => {
    expect(slugify("hello---world")).toBe("hello-world");
  });
});
