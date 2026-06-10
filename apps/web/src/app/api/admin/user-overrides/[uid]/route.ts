/**
 * Admin-only per-user entitlement override CRUD.
 *
 *   GET    /api/admin/user-overrides/{uid}  → the user's override (or null)
 *   PUT    /api/admin/user-overrides/{uid}  → replace the override
 *   DELETE /api/admin/user-overrides/{uid}  → clear the override
 *
 * Stored at `userEntitlementOverrides/{uid}`. The override is layered on top
 * of the user's plan by getEntitlements / getTeachingEntitlements, so an
 * admin can grant (or revoke) any individual capability for one user.
 */
import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/middleware/requireAdmin";
import { corsPreflight, withCors } from "@/lib/server/adminCors";
import { serializeTimestamps } from "@/lib/server/serialize";
import {
    ENTITLEMENT_FEATURES,
    ENTITLEMENT_QUOTAS,
    TEACHING_FEATURES,
    TEACHING_LIMITS,
} from "@digimine/types";

export const dynamic = "force-dynamic";

const COLLECTION = "userEntitlementOverrides";

const FEATURE_KEYS = new Set(ENTITLEMENT_FEATURES.map((f) => f.key));
const QUOTA_KEYS = new Set(ENTITLEMENT_QUOTAS.map((q) => q.key));
const TFEATURE_KEYS = new Set(TEACHING_FEATURES.map((f) => f.key));
const TLIMIT_KEYS = new Set(TEACHING_LIMITS.map((l) => l.key));

function pickBoolMap(raw: any, allowed: Set<string>): Record<string, boolean> {
    const out: Record<string, boolean> = {};
    if (raw && typeof raw === "object") {
        for (const k of Object.keys(raw)) {
            if (allowed.has(k) && typeof raw[k] === "boolean") out[k] = raw[k];
        }
    }
    return out;
}

function pickNumMap(raw: any, allowed: Set<string>): Record<string, number> {
    const out: Record<string, number> = {};
    if (raw && typeof raw === "object") {
        for (const k of Object.keys(raw)) {
            if (allowed.has(k) && typeof raw[k] === "number" && Number.isFinite(raw[k])) {
                out[k] = raw[k];
            }
        }
    }
    return out;
}

export function OPTIONS(req: NextRequest) {
    return corsPreflight(req);
}

export async function GET(req: NextRequest, { params }: { params: { uid: string } }) {
    const admin = await requireAdmin(req);
    if (admin instanceof NextResponse) return withCors(req, admin);

    const snap = await adminDb.collection(COLLECTION).doc(params.uid).get();
    const override = snap.exists ? serializeTimestamps({ id: snap.id, ...snap.data() }) : null;
    return withCors(req, NextResponse.json({ override }));
}

export async function PUT(req: NextRequest, { params }: { params: { uid: string } }) {
    const admin = await requireAdmin(req);
    if (admin instanceof NextResponse) return withCors(req, admin);

    const body = await req.json().catch(() => ({}));

    const features = pickBoolMap(body.features, FEATURE_KEYS);
    const quotas = pickNumMap(body.quotas, QUOTA_KEYS);
    const teachingFeatures = pickBoolMap(body.teachingFeatures, TFEATURE_KEYS);
    const teachingLimits = pickNumMap(body.teachingLimits, TLIMIT_KEYS);
    const aiQuestionsPerDay =
        typeof body.aiQuestionsPerDay === "number" || body.aiQuestionsPerDay === null
            ? body.aiQuestionsPerDay
            : undefined;
    const note = typeof body.note === "string" ? body.note.slice(0, 500) : "";
    const expiresAt =
        body.expiresAt && !Number.isNaN(new Date(body.expiresAt).getTime())
            ? Timestamp.fromDate(new Date(body.expiresAt))
            : null;

    // If the admin cleared everything, remove the doc entirely so the user
    // simply inherits their plan again.
    const hasAny =
        Object.keys(features).length > 0 ||
        Object.keys(quotas).length > 0 ||
        Object.keys(teachingFeatures).length > 0 ||
        Object.keys(teachingLimits).length > 0 ||
        aiQuestionsPerDay !== undefined;

    if (!hasAny) {
        await adminDb.collection(COLLECTION).doc(params.uid).delete().catch(() => {});
        return withCors(req, NextResponse.json({ override: null, cleared: true }));
    }

    const payload: Record<string, any> = {
        userId: params.uid,
        features,
        quotas,
        teachingFeatures,
        teachingLimits,
        note,
        expiresAt,
        grantedBy: admin.uid,
        updatedAt: FieldValue.serverTimestamp(),
    };
    if (aiQuestionsPerDay !== undefined) payload.aiQuestionsPerDay = aiQuestionsPerDay;

    await adminDb.collection(COLLECTION).doc(params.uid).set(payload);
    const snap = await adminDb.collection(COLLECTION).doc(params.uid).get();
    return withCors(req, NextResponse.json({ override: serializeTimestamps({ id: snap.id, ...snap.data() }) }));
}

export async function DELETE(req: NextRequest, { params }: { params: { uid: string } }) {
    const admin = await requireAdmin(req);
    if (admin instanceof NextResponse) return withCors(req, admin);
    await adminDb.collection(COLLECTION).doc(params.uid).delete().catch(() => {});
    return withCors(req, NextResponse.json({ override: null, cleared: true }));
}
