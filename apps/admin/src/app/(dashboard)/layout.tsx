"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppSidebar, DashboardShell } from "@digimine/ui";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { adminNav } from "@/components/layout/sidebarNav";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname() ?? "/";
    const { user, signOut } = useAdminAuth();

    const handleSignOut = async () => {
        try {
            await signOut();
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error("Error signing out:", error);
        }
    };

    return (
        <DashboardShell
            sidebar={({ isOpen, onClose, collapsed, onToggleCollapsed }) => (
                <AppSidebar
                    role="admin"
                    pathname={pathname}
                    nav={adminNav}
                    user={user}
                    LinkComponent={Link}
                    onSignOut={handleSignOut}
                    brandHref="/"
                    isOpen={isOpen}
                    onClose={onClose}
                    collapsed={collapsed}
                    onToggleCollapsed={onToggleCollapsed}
                />
            )}
        >
            {children}
        </DashboardShell>
    );
}
