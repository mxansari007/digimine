"use client";

import { useState } from "react";
import { AdminSidebar } from "@/components/layout/AdminSidebar";
import { Logo } from "@/components/common/Logo";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

    return (
        <div className="flex min-h-screen bg-slate-100 bg-grid-pattern relative">
            <AdminSidebar 
                isOpen={isMobileSidebarOpen} 
                onClose={() => setIsMobileSidebarOpen(false)} 
            />
            
            <main className="flex-1 lg:ml-64 flex flex-col min-h-screen relative z-0 min-w-0">
                {/* Mobile Top Bar */}
                <div className="lg:hidden flex items-center justify-between p-4 bg-slate-950/95 backdrop-blur-xl border-b border-white/10 sticky top-0 z-20 shadow-lg">
                    <div className="flex items-center gap-2">
                        <Logo variant="light" iconSize={24} />
                    </div>
                    <button 
                        onClick={() => setIsMobileSidebarOpen(true)}
                        className="p-2 text-slate-300 hover:text-white transition-colors"
                        aria-label="Open sidebar"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 p-4 sm:p-8 overflow-y-auto min-w-0 overflow-x-hidden">
                    <div className="max-w-7xl mx-auto w-full">{children}</div>
                </div>
            </main>
        </div>
    );
}
