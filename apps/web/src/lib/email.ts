import { render } from "@react-email/render";
import { OrderSuccessEmail } from "@/components/emails/OrderSuccessEmail";
import { OrderOtpEmail } from "@/components/emails/OrderOtpEmail";
import { adminDb } from "@/lib/firebase/admin";
// Brevo Configuration
const BREVO_API_KEY = process.env.BREVO_API_KEY || "";
const FROM_EMAIL = process.env.BREVO_FROM_EMAIL || "noreply@digimine.shop";
const FROM_NAME = process.env.BREVO_FROM_NAME || "Digimine";

async function sendViaBrevo(to: string, subject: string, html: string) {
    if (!BREVO_API_KEY) {
        console.warn("BREVO_API_KEY is not set. Skipping email.");
        if (process.env.NODE_ENV === "development") {
            console.log("----------------- EMAIL SIMULATION -----------------");
            console.log(`To: ${to}`);
            console.log(`Subject: ${subject}`);
            console.log("----------------------------------------------------");
        }
        return { success: false, error: "Missing Credentials" };
    }

    try {
        const response = await fetch("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: {
                "accept": "application/json",
                "api-key": BREVO_API_KEY,
                "content-type": "application/json",
            },
            body: JSON.stringify({
                sender: { email: FROM_EMAIL, name: FROM_NAME },
                to: [{ email: to }],
                subject: subject,
                htmlContent: html,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            console.error("Brevo API Error:", errorData || response.statusText);
            throw new Error(`Brevo API responded with status ${response.status}`);
        }

        const data = await response.json();
        console.log(`Email sent successfully via Brevo to ${to}. MessageId: ${data.messageId}`);
        return { success: true, data };
    } catch (error: any) {
        console.error("Failed to send Brevo email:", error);
        throw error;
    }
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
