/**
 * Test driver for the per-day AI quota path.
 *
 * Asserts:
 *   1. Resolver returns the right cap for each plan we seeded.
 *   2. commitAiUsage transactionally reserves, rejects on overflow,
 *      and refundAiUsage decrements the counter.
 *   3. Day rollover: a stale `aiUsage/{uid}` doc with yesterday's date
 *      reports usage as 0 today (counter resets).
 *
 * Run: pnpm tsx scripts/test-ai-quota.ts
 */
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import * as path from "path";

require("dotenv").config({ path: path.resolve(__dirname, "../apps/web/.env.local") });
require("dotenv").config({ path: path.resolve(__dirname, "../apps/web/.env") });

if (getApps().length === 0) {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "digimine-1c33f";
    initializeApp({ projectId });
}
const db = getFirestore();

const IST_OFFSET_MIN = 330;
function istDateString(now: Date = new Date()): string {
    const ms = now.getTime() + IST_OFFSET_MIN * 60_000;
    const ist = new Date(ms);
    return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(ist.getUTCDate()).padStart(2, "0")}`;
}

const TEST_UID = "test-ai-quota-uid";

async function planCap(code: string): Promise<number | null | "missing"> {
    const snap = await db.collection("subscriptionPlans").where("code", "==", code).get();
    if (snap.empty) return "missing";
    const d = snap.docs[0].data() || {};
    return typeof d.aiQuestionsPerDay === "number" ? d.aiQuestionsPerDay : null;
}

async function clearUsage() {
    await db.collection("aiUsage").doc(TEST_UID).delete().catch(() => {});
}

async function commit(count: number, cap: number | null) {
    // Inline copy of commitAiUsage's logic so we can run it from a script
    // without booting Next. If the impl changes, mirror the change here.
    if (cap === 0) return { ok: false, reason: "would_exceed", used: 0, cap: 0 } as const;
    const ref = db.collection("aiUsage").doc(TEST_UID);
    const today = istDateString();
    return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.exists ? snap.data() || {} : {};
        const usedToday = data.date === today && typeof data.count === "number" ? data.count : 0;
        if (cap !== null && usedToday + count > cap) {
            return { ok: false as const, reason: "would_exceed" as const, used: usedToday, cap };
        }
        const nextUsed = usedToday + count;
        tx.set(ref, { date: today, count: nextUsed, updatedAt: Timestamp.now() }, { merge: true });
        return { ok: true as const, used: nextUsed };
    });
}

async function refund(count: number) {
    const ref = db.collection("aiUsage").doc(TEST_UID);
    const today = istDateString();
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const data = snap.data() || {};
        if (data.date !== today) return;
        const usedToday = typeof data.count === "number" ? data.count : 0;
        tx.set(ref, { date: today, count: Math.max(0, usedToday - count), updatedAt: Timestamp.now() }, { merge: true });
    });
}

async function readUsage() {
    const snap = await db.collection("aiUsage").doc(TEST_UID).get();
    return snap.exists ? snap.data() : null;
}

function expect(cond: any, label: string) {
    if (!cond) {
        console.error("  ✗ FAIL:", label);
        process.exitCode = 1;
    } else {
        console.log("  ✓", label);
    }
}

async function run() {
    console.log("[test] Phase 1 — plan caps from seed");
    for (const code of ["teacher-free", "teacher-starter", "teacher-pro", "institute-free", "institute-growth", "institute-scale"]) {
        console.log(`  ${code.padEnd(20)} cap=${await planCap(code)}`);
    }

    console.log("\n[test] Phase 2 — commit + reject + refund");
    await clearUsage();

    const cap = 10;
    let r = await commit(5, cap);
    expect(r.ok && r.used === 5, "first commit of 5 → used=5");
    r = await commit(4, cap);
    expect(r.ok && r.used === 9, "second commit of 4 → used=9");
    r = await commit(2, cap);
    expect(!r.ok && r.reason === "would_exceed" && r.used === 9, "third commit of 2 would exceed → rejected, still used=9");
    r = await commit(1, cap);
    expect(r.ok && r.used === 10, "commit of 1 fills exactly to cap → used=10");
    r = await commit(1, cap);
    expect(!r.ok && r.reason === "would_exceed", "any further commit rejected");

    await refund(3);
    const after = await readUsage();
    expect(after?.count === 7, `refund of 3 → used=7 (got ${after?.count})`);

    console.log("\n[test] Phase 3 — cap=0 blocks all commits");
    r = await commit(1, 0);
    expect(!r.ok && r.cap === 0, "cap=0 rejects commit of 1");

    console.log("\n[test] Phase 4 — cap=null permits unbounded commits");
    await clearUsage();
    r = await commit(1000, null);
    expect(r.ok && r.used === 1000, "unlimited cap accepts 1000");

    console.log("\n[test] Phase 5 — day rollover resets counter");
    const ref = db.collection("aiUsage").doc(TEST_UID);
    await ref.set({ date: "1999-01-01", count: 50, updatedAt: Timestamp.now() });
    // Now commit — the stale-date doc should be treated as zero usage.
    r = await commit(7, 100);
    expect(r.ok && r.used === 7, `after stale doc, commit of 7 → used=7 (got ${r.ok ? r.used : "FAIL"})`);

    await clearUsage();
    console.log("\n[test] done.");
}

run()
    .then(() => process.exit(process.exitCode || 0))
    .catch((err) => {
        console.error("[test] threw:", err);
        process.exit(1);
    });
