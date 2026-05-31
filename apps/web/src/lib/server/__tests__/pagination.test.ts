import { describe, it, expect } from "vitest";
import { parsePageParams, paginateQuery } from "../pagination";

// Minimal stand-in for a firebase-admin Query that supports the subset
// paginateQuery uses: count().get(), offset(), limit(), get(). offset/limit
// return new instances (like the real chainable Query).
class FakeQuery {
    constructor(
        private docs: Array<{ id: string; [k: string]: unknown }>,
        private countVal: number | "throw",
        private off = 0,
        private lim = Number.POSITIVE_INFINITY
    ) {}
    count() {
        return {
            get: async () => {
                if (this.countVal === "throw") throw new Error("count unavailable");
                return { data: () => ({ count: this.countVal }) };
            },
        };
    }
    offset(n: number) {
        return new FakeQuery(this.docs, this.countVal, n, this.lim);
    }
    limit(n: number) {
        return new FakeQuery(this.docs, this.countVal, this.off, n);
    }
    async get() {
        const end = this.lim === Number.POSITIVE_INFINITY ? this.docs.length : this.off + this.lim;
        const slice = this.docs.slice(this.off, end);
        return { docs: slice.map((d) => ({ id: d.id, data: () => d })) };
    }
}

function makeDocs(n: number) {
    return Array.from({ length: n }, (_, i) => ({ id: `id${i}`, n: i }));
}

function req(qs: string) {
    return new Request(`https://x/api${qs}`);
}

describe("parsePageParams", () => {
    it("defaults to page 1 + default size", () => {
        expect(parsePageParams(req(""))).toEqual({ page: 1, pageSize: 20 });
    });
    it("reads page + pageSize", () => {
        expect(parsePageParams(req("?page=3&pageSize=50"))).toEqual({ page: 3, pageSize: 50 });
    });
    it("clamps pageSize to maxPageSize", () => {
        expect(parsePageParams(req("?pageSize=999"), { maxPageSize: 100 }).pageSize).toBe(100);
    });
    it("floors invalid/negative page to 1", () => {
        expect(parsePageParams(req("?page=0")).page).toBe(1);
        expect(parsePageParams(req("?page=-5")).page).toBe(1);
        expect(parsePageParams(req("?page=abc")).page).toBe(1);
    });
    it("honours custom defaults", () => {
        expect(parsePageParams(req(""), { defaultPageSize: 25 }).pageSize).toBe(25);
    });
});

describe("paginateQuery", () => {
    it("returns the first page + correct totals", async () => {
        const q = new FakeQuery(makeDocs(30), 30) as unknown as import("firebase-admin/firestore").Query;
        const res = await paginateQuery(q, { page: 1, pageSize: 10 });
        expect(res.items).toHaveLength(10);
        expect((res.items[0] as { id: string }).id).toBe("id0");
        expect(res.total).toBe(30);
        expect(res.totalPages).toBe(3);
        expect(res.page).toBe(1);
    });

    it("offsets to the requested page", async () => {
        const q = new FakeQuery(makeDocs(30), 30) as unknown as import("firebase-admin/firestore").Query;
        const res = await paginateQuery(q, { page: 2, pageSize: 10 });
        expect((res.items[0] as { id: string }).id).toBe("id10");
        expect(res.page).toBe(2);
    });

    it("clamps a page beyond the end to the last page", async () => {
        const q = new FakeQuery(makeDocs(25), 25) as unknown as import("firebase-admin/firestore").Query;
        const res = await paginateQuery(q, { page: 99, pageSize: 10 });
        expect(res.page).toBe(3); // 25 rows / 10 = 3 pages
        expect(res.items).toHaveLength(5);
    });

    it("applies a row mapper when given", async () => {
        const q = new FakeQuery(makeDocs(3), 3) as unknown as import("firebase-admin/firestore").Query;
        const res = await paginateQuery(q, { page: 1, pageSize: 10 }, (d) => ({ key: d.id }));
        expect(res.items).toEqual([{ key: "id0" }, { key: "id1" }, { key: "id2" }]);
    });

    it("falls back to a best-effort total when count() fails", async () => {
        const q = new FakeQuery(makeDocs(8), "throw") as unknown as import("firebase-admin/firestore").Query;
        const res = await paginateQuery(q, { page: 1, pageSize: 10 });
        expect(res.items).toHaveLength(8);
        expect(res.total).toBe(8); // offset(0) + fetched length
    });
});
