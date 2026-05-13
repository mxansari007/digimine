"use client";

import { AdminSidebar } from "@/components/layout/AdminSidebar";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-h-screen bg-slate-50 bg-grid-pattern relative">
            <AdminSidebar />
            <main className="flex-1 ml-64 p-8 overflow-y-auto h-screen relative z-0">
                <div className="max-w-7xl mx-auto">{children}</div>
            </main>
        </div>
    );
}
