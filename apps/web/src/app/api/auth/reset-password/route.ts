import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { sendPasswordResetBrevo } from "@/lib/email";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { email } = body;

        if (!email) {
            return NextResponse.json(
                { error: "Email is required" },
                { status: 400 }
            );
        }

        try {
            // Securely generate the password reset link using Firebase Admin
            const resetLink = await adminAuth.generatePasswordResetLink(email);
            
            // Dispatch the email directly via Brevo, bypassing Firebase SMTP
            await sendPasswordResetBrevo(email, resetLink);
        } catch (authError: any) {
            // If the user doesn't exist, Firebase throws 'auth/user-not-found'
            // To prevent email enumeration attacks (matching Firebase default behavior),
            // we catch this and return success anyway.
            if (authError.code === "auth/user-not-found") {
                console.log(`Password reset requested for non-existent email: ${email}`);
            } else {
                console.error("Error generating reset link or sending email:", authError);
                throw authError; // re-throw to be caught by the outer block
            }
        }

        // Return success whether the user existed or not
        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Password reset API error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
