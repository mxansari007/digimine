import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
// unused Timestamp import removed

interface SecureAccessRequest {
    orderId: string;
    accessKey: string;
}

export async function POST(request: NextRequest) {
    try {
        const body: SecureAccessRequest = await request.json();
        const { orderId, accessKey } = body;

        if (!orderId || !accessKey) {
            return NextResponse.json(
                { error: "Order ID and Access Key are required" },
                { status: 400 }
            );
        }

        // Fetch Order Details Securely
        const orderSnap = await adminDb.collection("orders").doc(orderId).get();
        if (!orderSnap.exists) {
            return NextResponse.json(
                { error: "Order not found" },
                { status: 404 }
            );
        }

        const orderData = { id: orderSnap.id, ...orderSnap.data() } as any;

        // Verify Access Key
        if (!orderData.accessKey || orderData.accessKey !== accessKey) {
            return NextResponse.json(
                { error: "Invalid Access Key" },
                { status: 403 }
            );
        }

        // Fetch User purchases to check if we should show files
        // Actually, since they verified OTP for THIS order, they are owner.
        // We can fetch files directly.

        const items: any[] = orderData.items || [];
        const allFiles: any[] = [];

        for (const item of items) {
            try {
                // Fetch files for this product using Admin SDK
                const filesSnap = await adminDb.collection("products").doc(item.productId).collection("files").get();
                filesSnap.docs.forEach(fileDoc => {
                    allFiles.push({
                        id: fileDoc.id,
                        productName: item.productName,
                        ...fileDoc.data()
                    });
                });
            } catch (e) {
                console.log(`No files found for ${item.productId}`);
            }
        }

        return NextResponse.json({
            success: true,
            order: orderData,
            files: allFiles
        });

    } catch (error) {
        console.error("Error verification order access:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
