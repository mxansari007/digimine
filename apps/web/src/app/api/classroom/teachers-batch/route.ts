import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { teacherIds } = body as { teacherIds: string[] };

        if (!teacherIds || !Array.isArray(teacherIds) || teacherIds.length === 0) {
            return NextResponse.json({ teachers: [] });
        }

        const uniqueIds = [...new Set(teacherIds)].slice(0, 50);

        const results: Array<{
            teacherId: string;
            teacherName: string;
            teacherAvatar: string | null;
            teacherInstitute: string;
            inviteCode: string;
        }> = [];

        for (const teacherId of uniqueIds) {
            try {
                const teacherSnap = await adminDb
                    .collection("teachers")
                    .doc(teacherId)
                    .get();

                if (teacherSnap.exists) {
                    const data = teacherSnap.data();
                    results.push({
                        teacherId,
                        teacherName: data?.profile?.name || "Unknown Teacher",
                        teacherAvatar: data?.profile?.avatarUrl || null,
                        teacherInstitute: data?.profile?.institute || "",
                        inviteCode: data?.inviteCode || "",
                    });
                }
            } catch {
                // Skip teachers that can't be fetched
            }
        }

        return NextResponse.json({ teachers: results });
    } catch (error: any) {
        console.error("Batch teacher fetch error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to fetch teachers" },
            { status: 500 }
        );
    }
}
