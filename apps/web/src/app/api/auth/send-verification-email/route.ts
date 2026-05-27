import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { sendVerificationBrevo } from "@/lib/email";

export async function POST(request: Request) {
    try {
        const authHeader = request.headers.get("authorization") || "";
        const idToken = authHeader.startsWith("Bearer ")
            ? authHeader.slice("Bearer ".length)
            : null;
        if (!idToken) {
            return NextResponse.json(
                { error: "Missing authorization token" },
                { status: 401 }
            );
        }

        const decoded = await adminAuth.verifyIdToken(idToken);
        const userRecord = await adminAuth.getUser(decoded.uid);
        const email = userRecord.email;

        if (!email) {
            return NextResponse.json(
                { error: "Account has no email address" },
                { status: 400 }
            );
        }
        if (userRecord.emailVerified) {
            return NextResponse.json({ success: true, alreadyVerified: true });
        }

        const appUrl =
            process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
            new URL(request.url).origin;

        const verifyLink = await adminAuth.generateEmailVerificationLink(email, {
            url: `${appUrl}/verify-email`,
            handleCodeInApp: false,
        });

        await sendVerificationBrevo(email, verifyLink);

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        const code = (error as { code?: string })?.code || "";
        if (code === "auth/id-token-expired" || code === "auth/argument-error") {
            return NextResponse.json(
                { error: "Session expired. Sign in again." },
                { status: 401 }
            );
        }
        console.error("send-verification-email error:", error);
        return NextResponse.json(
            { error: "Failed to send verification email" },
            { status: 500 }
        );
    }
}
