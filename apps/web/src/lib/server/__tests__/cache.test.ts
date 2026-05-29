import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
};

vi.mock("@/lib/server/redis", () => ({
  getRedis: vi.fn(() => mockRedis),
}));

import { cachedJson, invalidateCache } from "../cache";

describe("cachedJson", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns cached value when Redis hit", async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify({ foo: "bar" }));

    const fetcher = vi.fn();
    const result = await cachedJson("key1", 60, fetcher);

    expect(result).toEqual({ foo: "bar" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("calls fetcher and caches on miss", async () => {
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue("OK");

    const fetcher = vi.fn().mockResolvedValue({ data: 42 });
    const result = await cachedJson("key2", 60, fetcher);

    expect(result).toEqual({ data: 42 });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(mockRedis.set).toHaveBeenCalledWith("key2", JSON.stringify({ data: 42 }), "EX", 60);
  });

  it("fail-open when Redis is null", async () => {
    const { getRedis } = await import("@/lib/server/redis");
    (getRedis as any).mockReturnValueOnce(null);

    const fetcher = vi.fn().mockResolvedValue({ data: 99 });
    const result = await cachedJson("key3", 60, fetcher);

    expect(result).toEqual({ data: 99 });
    expect(mockRedis.get).not.toHaveBeenCalled();
  });

  it("fail-open when Redis get throws", async () => {
    mockRedis.get.mockRejectedValue(new Error("Redis down"));

    const fetcher = vi.fn().mockResolvedValue({ data: 77 });
    const result = await cachedJson("key4", 60, fetcher);

    expect(result).toEqual({ data: 77 });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("fail-open when Redis set throws", async () => {
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockRejectedValue(new Error("Redis down"));

    const fetcher = vi.fn().mockResolvedValue({ data: 55 });
    const result = await cachedJson("key5", 60, fetcher);

    expect(result).toEqual({ data: 55 });
  });

  it("uses negative TTL for null results", async () => {
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue("OK");

    const fetcher = vi.fn().mockResolvedValue(null);
    await cachedJson("key6", 300, fetcher, { negativeTtlSeconds: 30 });

    expect(mockRedis.set).toHaveBeenCalledWith("key6", "null", "EX", 30);
  });

  it("uses default negative TTL (60s) when not specified", async () => {
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue("OK");

    const fetcher = vi.fn().mockResolvedValue(undefined);
    await cachedJson("key7", 300, fetcher);

    expect(mockRedis.set).toHaveBeenCalledWith("key7", undefined, "EX", 60);
  });

  it("does not cache when TTL is 0", async () => {
    mockRedis.get.mockResolvedValue(null);

    const fetcher = vi.fn().mockResolvedValue({ data: 1 });
    await cachedJson("key8", 0, fetcher);

    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it("BUG: caches undefined as literal string 'undefined'", async () => {
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue("OK");

    const fetcher = vi.fn().mockResolvedValue(undefined);
    await cachedJson("key9", 60, fetcher);

    // JSON.stringify(undefined) returns undefined (not a string)
    // Redis ioredis may store it as "undefined" or skip
    expect(mockRedis.set).toHaveBeenCalled();
  });

  it("BUG: negative TTL skips caching entirely", async () => {
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue("OK");

    const fetcher = vi.fn().mockResolvedValue(null);
    await cachedJson("key10", 60, fetcher, { negativeTtlSeconds: -10 });

    // When ttl <= 0, the function skips the set call entirely
    // This is actually a silent skip — no warning or error
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it("BUG: throws when fetcher throws (no error handling)", async () => {
    mockRedis.get.mockResolvedValue(null);

    const fetcher = vi.fn().mockRejectedValue(new Error("DB error"));
    await expect(cachedJson("key11", 60, fetcher)).rejects.toThrow("DB error");
  });
});

describe("invalidateCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes single key", async () => {
    mockRedis.del.mockResolvedValue(1);
    await invalidateCache("key1");
    expect(mockRedis.del).toHaveBeenCalledWith("key1");
  });

  it("deletes multiple keys", async () => {
    mockRedis.del.mockResolvedValue(2);
    await invalidateCache("key1", "key2", "key3");
    expect(mockRedis.del).toHaveBeenCalledWith("key1", "key2", "key3");
  });

  it("no-op when no keys provided", async () => {
    await invalidateCache();
    expect(mockRedis.del).not.toHaveBeenCalled();
  });

  it("no-op when Redis is null", async () => {
    const { getRedis } = await import("@/lib/server/redis");
    (getRedis as any).mockReturnValueOnce(null);

    await invalidateCache("key1");
    expect(mockRedis.del).not.toHaveBeenCalled();
  });

  it("fail-open when Redis del throws", async () => {
    mockRedis.del.mockRejectedValue(new Error("Redis down"));
    await expect(invalidateCache("key1")).resolves.toBeUndefined();
  });
});
