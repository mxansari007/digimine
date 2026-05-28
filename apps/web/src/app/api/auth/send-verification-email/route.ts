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
        const e = error as {
            code?: string;
            message?: string;
            brevoCode?: string;
            httpStatus?: number;
        };
        const code = e?.code || "";
        if (code === "auth/id-token-expired" || code === "auth/argument-error") {
            return NextResponse.json(
                { error: "Session expired. Sign in again." },
                { status: 401 }
            );
        }
        // Brevo + Firebase errors both have `message`. Bubble it up so the
        // client toast tells the user what's actually wrong (unverified
        // sender, bad API key, blocked recipient, etc.) instead of a generic
        // "Failed to send" that hides the real cause.
        console.error("send-verification-email error:", {
            code,
            brevoCode: e?.brevoCode,
            httpStatus: e?.httpStatus,
            message: e?.message,
        });
        return NextResponse.json(
            {
                error: e?.message || "Failed to send verification email",
                code: e?.brevoCode || code || undefined,
            },
            { status: 500 }
        );
    }
}
