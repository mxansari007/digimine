"use client";

import { Inter } from "next/font/google";
import "./globals.css";
import { AdminAuthProvider } from "@/contexts/AdminAuthContext";

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body className={`${inter.className} bg-gray-50 text-gray-900`}>
                <AdminAuthProvider>
                    {children}
                </AdminAuthProvider>
            </body>
        </html>
    );
}
