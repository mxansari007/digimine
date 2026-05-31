/**
 * GET /api/admin/products?page=&pageSize=&type=&purchaseType=  (admin-only, CORS)
 *
 * Server-paginated products, newest first. The `type` / `purchaseType` filters
 * map to Firestore equality `where` clauses (needs the (type, createdAt),
 * (purchaseType, createdAt) and (type, purchaseType, createdAt) indexes).
 */
import { NextRequest } from "next/server";
import type { Query } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { corsPreflight } from "@/lib/server/adminCors";
import { handleAdminList } from "@/lib/server/adminListRoute";
import { serializeTimestamps } from "@/lib/server/serialize";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
    return handleAdminList(
        req,
        (sp) => {
            let q: Query = adminDb.collection("products");
            const type = sp.get("type");
            const purchaseType = sp.get("purchaseType");
            if (type) q = q.where("type", "==", type);
            if (purchaseType) q = q.where("purchaseType", "==", purchaseType);
            return q.orderBy("createdAt", "desc");
        },
        { map: (d) => serializeTimestamps({ id: d.id, ...d.data() }) }
    );
}

export function OPTIONS(req: NextRequest) {
    return corsPreflight(req);
}
