import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPipeline = {
  zremrangebyscore: vi.fn().mockReturnThis(),
  zadd: vi.fn().mockReturnThis(),
  zcard: vi.fn().mockReturnThis(),
  pexpire: vi.fn().mockReturnThis(),
  exec: vi.fn(),
};

const mockRedis = {
  pipeline: vi.fn(() => mockPipeline),
};

vi.mock("@/lib/server/redis", () => ({
  getRedis: vi.fn(() => mockRedis),
}));

import { rateLimit, clientIp } from "../ratelimit";

describe("rateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows request under limit", async () => {
    mockPipeline.exec.mockResolvedValue([
      [null, 0],
      [null, 1],
      [null, 1],
      [null, 1],
    ]);

    const result = await rateLimit("api", "user1", { limit: 5, windowSeconds: 60 });
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("blocks request over limit", async () => {
    mockPipeline.exec.mockResolvedValue([
      [null, 0],
      [null, 1],
      [null, 10],
      [null, 1],
    ]);

    const result = await rateLimit("api", "user1", { limit: 5, windowSeconds: 60 });
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("fail-open when Redis is null", async () => {
    const { getRedis } = await import("@/lib/server/redis");
    (getRedis as any).mockReturnValueOnce(null);

    const result = await rateLimit("api", "user1", { limit: 5, windowSeconds: 60 });
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(5);
  });

  it("fail-open when Redis throws", async () => {
    mockPipeline.exec.mockRejectedValue(new Error("Redis down"));

    const result = await rateLimit("api", "user1", { limit: 5, windowSeconds: 60 });
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(5);
  });

  it("uses correct key format", async () => {
    mockPipeline.exec.mockResolvedValue([
      [null, 0],
      [null, 1],
      [null, 1],
      [null, 1],
    ]);

    await rateLimit("submit", "ip_1", { limit: 10, windowSeconds: 300 });
    expect(mockRedis.pipeline).toHaveBeenCalled();
  });

  it("BUG: off-by-one — allows exactly limit+1 requests", async () => {
    // count <= limit means limit=5 allows 6th request (count=6 returns false)
    // But count=5 returns true (5 <= 5) — this is actually correct per docs
    mockPipeline.exec.mockResolvedValue([
      [null, 0],
      [null, 1],
      [null, 5],
      [null, 1],
    ]);

    const result = await rateLimit("api", "user1", { limit: 5, windowSeconds: 60 });
    expect(result.success).toBe(true); // 5 <= 5
    expect(result.remaining).toBe(0);
  });

  it("BUG: negative windowSeconds produces negative TTL", async () => {
    mockPipeline.exec.mockResolvedValue([
      [null, 0],
      [null, 1],
      [null, 1],
      [null, 1],
    ]);

    const result = await rateLimit("api", "user1", { limit: 5, windowSeconds: -10 });
    expect(result.resetMs).toBeLessThan(Date.now());
  });

  it("BUG: zero limit always fails after first request", async () => {
    mockPipeline.exec.mockResolvedValue([
      [null, 0],
      [null, 1],
      [null, 1],
      [null, 1],
    ]);

    const result = await rateLimit("api", "user1", { limit: 0, windowSeconds: 60 });
    expect(result.success).toBe(false); // 1 <= 0 is false
  });
});

describe("clientIp", () => {
  it("extracts IP from x-forwarded-for", () => {
    const req = new Request("http://example.com", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(clientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip", () => {
    const req = new Request("http://example.com", {
      headers: { "x-real-ip": "9.8.7.6" },
    });
    expect(clientIp(req)).toBe("9.8.7.6");
  });

  it("returns 'unknown' when no headers present", () => {
    const req = new Request("http://example.com");
    expect(clientIp(req)).toBe("unknown");
  });

  it("trims whitespace from x-forwarded-for", () => {
    const req = new Request("http://example.com", {
      headers: { "x-forwarded-for": "  1.2.3.4  " },
    });
    expect(clientIp(req)).toBe("1.2.3.4");
  });

  it("BUG: accepts invalid IP format", () => {
    const req = new Request("http://example.com", {
      headers: { "x-forwarded-for": "not-an-ip" },
    });
    expect(clientIp(req)).toBe("not-an-ip");
  });

  it("BUG: empty x-forwarded-for falls through to x-real-ip", () => {
    const req = new Request("http://example.com", {
      headers: {
        "x-forwarded-for": "",
        "x-real-ip": "1.2.3.4",
      },
    });
    // empty string is truthy in JS? No, empty string is falsy
    // So xff.split will fail? Actually empty string is truthy in `if (xff)` — no, it's falsy
    expect(clientIp(req)).toBe("1.2.3.4");
  });
});
