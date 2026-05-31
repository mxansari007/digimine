/**
 * GET /api/admin/orders?page=&pageSize=&status=  (admin-only, CORS)
 *
 * Server-paginated orders — replaces the old client-SDK `getAllOrders()` that
 * capped at 50 and fetched them all up front. Newest first; optional status
 * filter maps to a Firestore `where` (needs the (status, createdAt) index).
 */
import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { corsPreflight } from "@/lib/server/adminCors";
import { handleAdminList } from "@/lib/server/adminListRoute";
import { serializeTimestamps } from "@/lib/server/serialize";

export const dynamic = "force-dynamic";

const ORDER_STATUSES = new Set(["pending", "completed", "failed", "refunded"]);

export function GET(req: NextRequest) {
    return handleAdminList(
        req,
        (sp) => {
            const status = sp.get("status");
            const base = adminDb.collection("orders");
            const filtered =
                status && ORDER_STATUSES.has(status) ? base.where("status", "==", status) : base;
            return filtered.orderBy("createdAt", "desc");
        },
        { map: (d) => serializeTimestamps({ id: d.id, ...d.data() }) }
    );
}

export function OPTIONS(req: NextRequest) {
    return corsPreflight(req);
}
