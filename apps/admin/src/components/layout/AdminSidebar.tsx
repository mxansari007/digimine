"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAdminAuth } from "@/contexts/AdminAuthContext";


const navigation = [
    { name: "Dashboard", href: "/", icon: "HomeIcon" },
    { name: "Products", href: "/products", icon: "TagIcon" },
    { name: "Orders", href: "/orders", icon: "ShoppingCartIcon" },
    { name: "Users", href: "/users", icon: "UsersIcon" },
    { name: "Settings", href: "/settings", icon: "CogIcon" },
];

export function AdminSidebar() {
    const pathname = usePathname();
    const { user, signOut } = useAdminAuth();

    const handleSignOut = async () => {
        try {
            await signOut();
        } catch (error) {
            console.error("Error signing out:", error);
        }
    };

    return (
        <div className="flex flex-col h-full bg-white border-r border-gray-200 w-64 fixed left-0 top-0 bottom-0 z-10">
            <div className="p-6 border-b border-gray-100 flex items-center justify-center">
                <h1 className="text-xl font-bold text-gray-900 tracking-tight">
                    DIGIMINE <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full ml-1">ADMIN</span>
                </h1>
            </div>

            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                {navigation.map((item) => {
                    const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${isActive
                                ? "bg-primary-50 text-primary-700"
                                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                                }`}
                        >
                            {/* Icon placeholder */}
                            <span className="w-5 h-5 mr-3 bg-current opacity-20 rounded" />
                            {item.name}
                        </Link>
                    );
                })}
            </nav>

            <div className="p-4 border-t border-gray-200">
                <div className="flex items-center gap-3 mb-4 px-2">
                    <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-xs">
                        {user?.displayName?.[0] || "A"}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                            {user?.displayName || "Admin User"}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                    </div>
                </div>
                <button
                    onClick={handleSignOut}
                    className="w-full flex items-center justify-center px-4 py-2 text-sm text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors font-medium"
                >
                    Sign Out
                </button>
            </div>
        </div>
    );
}
