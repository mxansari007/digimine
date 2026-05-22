import { NextResponse } from "next/server";
import { getBearerUserId } from "@/lib/server/classroomAccess";

export async function POST(req: Request) {
    try {
        const tokenUserId = await getBearerUserId(req).catch(() => null);
        if (!tokenUserId) {
            return NextResponse.json({ error: "Sign in to send invites." }, { status: 401 });
        }

        const body = await req.json();
        const { teacherId, studentEmail } = body;

        if (!teacherId) {
            return NextResponse.json({ error: "teacherId is required" }, { status: 400 });
        }

        if (tokenUserId !== teacherId) {
            return NextResponse.json(
                { error: "You can only send invites for your own classroom." },
                { status: 403 }
            );
        }

        const joinUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/join/${teacherId}`;

        return NextResponse.json({
            success: true,
            inviteLink: joinUrl,
            message: studentEmail
                ? `Invite link generated. In production, an email would be sent to ${studentEmail}.`
                : "Invite link generated successfully.",
        });
    } catch (error: any) {
        console.error("Invite error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to generate invite" },
            { status: 500 }
        );
    }
}
