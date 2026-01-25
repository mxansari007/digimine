import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { sendOtpEmail } from "@/lib/email";
import { Timestamp } from "firebase-admin/firestore";

interface SendOtpRequest {
    email: string;
    orderId: string;
}

export async function POST(request: NextRequest) {
    try {
        const body: SendOtpRequest = await request.json();
        const { email, orderId } = body;

        if (!email || !orderId) {
            return NextResponse.json(
                { error: "Email and Order ID are required" },
                { status: 400 }
            );
        }

        // 1. Verify Order matches Email
        const orderSnap = await adminDb.collection("orders").doc(orderId).get();
        if (!orderSnap.exists) {
            // Return generic success to prevent email enumeration
            return NextResponse.json({ success: true, message: "OTP sent if email matches order." });
        }

        const order = orderSnap.data();
        if (order?.customerEmail !== email) {
            console.warn(`Email mismatch for order ${orderId}: ${email} != ${order?.customerEmail}`);
            // Return generic success to prevent email enumeration
            return NextResponse.json({ success: true, message: "OTP sent if email matches order." });
        }

        // 2. Generate OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // 3. Store OTP in Firestore (Expires in 10 minutes)
        const expiresAt = Timestamp.fromMillis(Date.now() + 10 * 60 * 1000);

        // Use a composite key or a subcollection. Here using a top-level collection for simplicity.
        // ID: email_orderId to rate limit/overwrite previous OTPs easily
        const otpId = `${email}_${orderId}`.replace(/[^a-zA-Z0-9]/g, "_");

        await adminDb.collection("verification_otps").doc(otpId).set({
            email,
            orderId,
            otp,
            expiresAt,
            createdAt: Timestamp.now(),
            attemps: 0
        });

        // 4. Send Email
        console.log("----------------------------------------------------------------");
        console.log(`[DEV MODE] Generated OTP for ${email}: ${otp}`);
        console.log("----------------------------------------------------------------");

        try {
            await sendOtpEmail(email, otp, orderId);
        } catch (emailError: any) {
            console.error("[DEV MODE warning] Failed to send OTP email:", emailError.message);
            // In production, we might want to fail. 
            // For now, allow proceeding if email fails (likely due to Resend sandbox limits)
            // so developer can test using the console log.
        }

        return NextResponse.json({ success: true, message: "OTP sent successfully" });

    } catch (error) {
        console.error("Error sending OTP:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
