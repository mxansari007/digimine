import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

export async function GET(_req: Request, { params }: { params: { jobId: string } }) {
    try {
        const { jobId } = params;
        const jobRef = adminDb.collection("jobs").doc(jobId);
        const jobSnap = await jobRef.get();

        if (!jobSnap.exists) {
            return NextResponse.json({ error: "Job not found" }, { status: 404 });
        }

        const job = jobSnap.data();
        return NextResponse.json({
            id: jobId,
            status: job?.status,
            result: job?.result || null,
            error: job?.error || null,
        });
    } catch (error: any) {
        console.error("Error fetching job status:", error);
        return NextResponse.json(
            { error: error.message || "Failed to fetch job status" },
            { status: 500 }
        );
    }
}
