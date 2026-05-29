import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { siteOrigin, absoluteUrl, buildMetadata } from "../index";

describe("siteOrigin", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("uses NEXT_PUBLIC_SITE_URL when available", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://custom-site.com";
    expect(siteOrigin()).toBe("https://custom-site.com");
  });

  it("falls back to NEXT_PUBLIC_APP_URL", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://app-url.com";
    expect(siteOrigin()).toBe("https://app-url.com");
  });

  it("falls back to default origin", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(siteOrigin()).toBe("https://placementranker.com");
  });

  it("strips trailing slash from env URL", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://site.com/";
    expect(siteOrigin()).toBe("https://site.com");
  });

  it("BUG: does not validate URL format", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "not-a-valid-url";
    expect(siteOrigin()).toBe("not-a-valid-url");
  });
});

describe("absoluteUrl", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://placementranker.com";
  });

  it("joins origin with path", () => {
    expect(absoluteUrl("/about")).toBe("https://placementranker.com/about");
  });

  it("handles path without leading slash", () => {
    expect(absoluteUrl("about")).toBe("https://placementranker.com/about");
  });

  it("returns origin for empty path", () => {
    expect(absoluteUrl("")).toBe("https://placementranker.com");
  });

  it("returns absolute URL as-is", () => {
    expect(absoluteUrl("https://other.com/page")).toBe("https://other.com/page");
  });

  it("handles URL with protocol", () => {
    expect(absoluteUrl("http://other.com")).toBe("http://other.com");
  });
});

describe("buildMetadata", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://placementranker.com";
  });

  it("builds basic metadata", () => {
    const meta = buildMetadata({
      title: "About Us",
      description: "Learn more about us",
      path: "/about",
    });
    expect(meta.title).toBe("About Us");
    expect(meta.description).toBe("Learn more about us");
    expect(meta.alternates?.canonical).toBe("https://placementranker.com/about");
  });

  it("uses default OG image when none provided", () => {
    const meta = buildMetadata({
      title: "Page",
      description: "Desc",
    });
    const og = meta.openGraph;
    expect(og?.images).toBeDefined();
  });

  it("sets noIndex when requested", () => {
    const meta = buildMetadata({
      title: "Draft",
      description: "Draft page",
      noIndex: true,
    });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it("uses custom canonical when provided", () => {
    const meta = buildMetadata({
      title: "Page",
      description: "Desc",
      canonical: "https://other.com/page",
    });
    expect(meta.alternates?.canonical).toBe("https://other.com/page");
  });

  it("trims description", () => {
    const meta = buildMetadata({
      title: "Page",
      description: "  Desc with spaces  ",
    });
    expect(meta.description).toBe("Desc with spaces");
  });

  it("falls back to SITE_TAGLINE for empty description", () => {
    const meta = buildMetadata({
      title: "Page",
      description: "",
    });
    expect(meta.description).toBeTruthy();
  });

  it("handles article OG type", () => {
    const meta = buildMetadata({
      title: "Article",
      description: "An article",
      ogType: "article",
      publishedTime: "2024-01-01",
      authors: ["John Doe"],
    });
    expect(meta.openGraph?.type).toBe("article");
  });

  it("BUG: empty title is accepted without warning", () => {
    const meta = buildMetadata({
      title: "",
      description: "Desc",
    });
    expect(meta.title).toBe("");
  });

  it("BUG: title longer than 60 chars is not truncated", () => {
    const longTitle = "A".repeat(100);
    const meta = buildMetadata({
      title: longTitle,
      description: "Desc",
    });
    expect(meta.title).toBe(longTitle);
  });

  it("BUG: description longer than 160 chars is not truncated", () => {
    const longDesc = "B".repeat(200);
    const meta = buildMetadata({
      title: "Page",
      description: longDesc,
    });
    expect(meta.description).toBe(longDesc);
  });
});
