/**
 * GET /api/admin/users?page=&pageSize=  (admin-only, CORS for the admin app)
 *
 * Server-paginated user list — replaces the admin app's old client-SDK
 * `getAllUsers()` that fetched up to 100 users at once. Newest first.
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
        () => adminDb.collection("users").orderBy("createdAt", "desc"),
        { map: (d) => serializeTimestamps({ id: d.id, ...d.data() }) }
    );
}

export function OPTIONS(req: NextRequest) {
    return corsPreflight(req);
}
