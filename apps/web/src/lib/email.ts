import { render } from "@react-email/render";
import { OrderSuccessEmail } from "@/components/emails/OrderSuccessEmail";
import { OrderOtpEmail } from "@/components/emails/OrderOtpEmail";
import { PasswordResetEmail } from "@/components/emails/PasswordResetEmail";
import { EmailVerificationEmail } from "@/components/emails/EmailVerificationEmail";
import { adminDb } from "@/lib/firebase/admin";
// Brevo Configuration
const BREVO_API_KEY = process.env.BREVO_API_KEY || "";
const FROM_EMAIL = process.env.BREVO_FROM_EMAIL || "noreply@digimine.shop";
const FROM_NAME = process.env.BREVO_FROM_NAME || "PlacementRanker";

async function sendViaBrevo(to: string, subject: string, html: string) {
    if (!BREVO_API_KEY) {
        console.warn("BREVO_API_KEY is not set. Skipping email.");
        if (process.env.NODE_ENV === "development") {
            console.log("----------------- EMAIL SIMULATION -----------------");
            console.log(`To: ${to}`);
            console.log(`Subject: ${subject}`);
            console.log("----------------------------------------------------");
        }
        // In production we shouldn't pretend the email was sent — throw so the
        // caller (and the user) learns about the misconfiguration instead of
        // silently failing.
        throw new Error("Email service not configured (BREVO_API_KEY missing)");
    }

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
            accept: "application/json",
            "api-key": BREVO_API_KEY,
            "content-type": "application/json",
        },
        body: JSON.stringify({
            sender: { email: FROM_EMAIL, name: FROM_NAME },
            to: [{ email: to }],
            subject,
            htmlContent: html,
        }),
    });

    if (!response.ok) {
        // Brevo error body is shaped { code, message } — surface both in the
        // thrown Error so route handlers can return a useful reason instead of
        // a generic "Failed to send" message.
        const errorData = await response.json().catch(() => null);
        const brevoCode = errorData?.code || "";
        const brevoMessage = errorData?.message || response.statusText || "unknown";
        console.error("Brevo API Error:", {
            httpStatus: response.status,
            code: brevoCode,
            message: brevoMessage,
            from: FROM_EMAIL,
            to,
        });
        const err = new Error(
            `Brevo (${response.status}${brevoCode ? ` ${brevoCode}` : ""}): ${brevoMessage}`
        );
        (err as any).brevoCode = brevoCode;
        (err as any).httpStatus = response.status;
        throw err;
    }

    const data = await response.json();
    console.log(`Email sent successfully via Brevo to ${to}. MessageId: ${data.messageId}`);
    return { success: true, data };
}

export async function sendOrderEmail(orderId: string) {
    try {
        // 1. Fetch Order Details
        const orderSnap = await adminDb.collection("orders").doc(orderId).get();
        if (!orderSnap.exists) {
            console.error(`Order ${orderId} not found for email sending.`);
            return;
        }
        const order = orderSnap.data();
        if (!order) return;

        // 2. Prepare Items
        const itemsWithLinks = await Promise.all(order.items.map(async (item: any) => {
            return {
                ...item
                // logic for individual links removed in favor of master access key
            };
        }));

        // 3. Render HTML
        const emailHtml = await render(
            OrderSuccessEmail({
                orderId: orderId,
                customerName: order.customerEmail.split("@")[0],
                items: itemsWithLinks,
                total: order.total,
                accessKey: order.accessKey,
            })
        );

        // 4. Send
        await sendViaBrevo(order.customerEmail, `Order Confirmation #${orderId}`, emailHtml);

    } catch (error) {
        console.error("Failed to send order email:", error);
    }
}

export async function sendOtpEmail(email: string, otp: string, orderId: string) {
    try {
        const emailHtml = await render(
            OrderOtpEmail({
                otp,
                orderId,
            })
        );

        await sendViaBrevo(email, `Verify Access to Order #${orderId}`, emailHtml);

    } catch (error) {
        console.error("Failed to send OTP email:", error);
        // Don't throw if in dev/resend-issues, but here we expect it to work or fail hard
        // throw error; 
    }
}

export async function sendVerificationBrevo(email: string, verifyLink: string) {
    try {
        const emailHtml = await render(
            EmailVerificationEmail({
                verifyLink,
            })
        );

        await sendViaBrevo(email, "Verify your PlacementRanker email", emailHtml);
    } catch (error) {
        console.error("Failed to send verification email via Brevo:", error);
        throw error;
    }
}

export async function sendPasswordResetBrevo(email: string, resetLink: string) {
    try {
        const emailHtml = await render(
            PasswordResetEmail({
                resetLink,
            })
        );

        await sendViaBrevo(email, "Reset your PlacementRanker password", emailHtml);
    } catch (error) {
        console.error("Failed to send password reset email via Brevo:", error);
        throw error;
    }
}
