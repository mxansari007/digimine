/**
 * GET /api/admin/teachers?page=&pageSize=  (admin-only, CORS)
 *
 * Server-paginated teacher list, newest first.
 */
import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { corsPreflight } from "@/lib/server/adminCors";
import { handleAdminList } from "@/lib/server/adminListRoute";
import { serializeTimestamps } from "@/lib/server/serialize";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
    return handleAdminList(
        req,
        () => adminDb.collection("teachers").orderBy("createdAt", "desc"),
        { map: (d) => serializeTimestamps({ id: d.id, ...d.data() }) }
    );
}

export function OPTIONS(req: NextRequest) {
    return corsPreflight(req);
}
