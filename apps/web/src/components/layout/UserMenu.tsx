"use client";

/**
 * Authenticated user dropdown that lives in the desktop header. Replaces the
 * previous inline "{displayName} · Sign Out" chrome with a proper avatar →
 * menu pattern: avatar pill stays compact in the header, and clicking it
 * opens a popover with name + email, dashboard / role-specific links, and
 * the sign-out action.
 *
 *  - Uses the shared `Avatar` component, which falls back to initials on
 *    image error (Google profile token expiry, deleted CDN object, etc.) —
 *    so the header never shows a broken-image icon.
 *  - Click-outside / Escape both close the menu.
 *  - Role-aware links so teachers / institute admins / students each see a
 *    "Go to my dashboard" pointing at the right home.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Star } from "lucide-react";
import type { User } from "@digimine/types";
import Avatar from "@/components/common/Avatar";
import { userHomePath } from "@/lib/auth/redirects";

export interface UserMenuProps {
    user: Pick<User, "displayName" | "email" | "photoURL" | "role"> | null;
    onSignOut: () => void;
    dashboardLabel?: string;
    /**
     * True only when the caller has an active subscription on a paid
     * (non-free) plan. The parent (Header) reads this from
     * `useEntitlements().isPremium` and passes it down. We accept it
     * as a prop rather than reading entitlements directly so UserMenu
     * doesn't depend on EntitlementsProvider being mounted — that
     * keeps it usable in shells (e.g. admin layout) that don't wrap
     * with the entitlements context.
     */
    isPremium?: boolean;
}

export default function UserMenu({
    user,
    onSignOut,
    dashboardLabel = "My dashboard",
    isPremium = false,
}: UserMenuProps) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;
        const onDocClick = (e: MouseEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onDocClick);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDocClick);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const dashboardHref = user ? userHomePath(user) : "/dashboard";
    const displayName = user?.displayName || "Account";
    const subline = user?.email || "Signed in";

    return (
        <div ref={rootRef} className="relative">
            {/* Avatar-first trigger. Drops the chevron and the trailing name
                pill on small screens so the header stays compact — the
                avatar alone already reads as "open my account menu". The
                first name only re-appears on lg+ where there's room. */}
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label="Open account menu"
                className="group flex items-center gap-2 rounded-full p-0.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 lg:border lg:border-slate-200 lg:bg-white lg:pl-1 lg:pr-3 lg:py-1 lg:shadow-sm lg:hover:border-primary-200 lg:hover:bg-primary-50/40 lg:hover:text-primary-700"
            >
                <span className="relative inline-flex">
                    <Avatar
                        src={user?.photoURL}
                        name={user?.displayName}
                        email={user?.email}
                        size={28}
                    />
                    {isPremium && (
                        <span
                            aria-label="Pro member"
                            title="Pro member"
                            className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-amber-900 ring-2 ring-white"
                        >
                            <Star className="h-2.5 w-2.5 fill-current" aria-hidden />
                        </span>
                    )}
                </span>
                <span className="hidden max-w-[140px] items-center gap-1.5 truncate lg:inline-flex">
                    {user?.displayName?.split(" ")[0] || "Account"}
                    {isPremium && (
                        <span className="rounded-md bg-gradient-to-r from-amber-400 to-amber-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950 shadow-sm">
                            Pro
                        </span>
                    )}
                </span>
            </button>

            {open && (
                <div
                    role="menu"
                    className="absolute right-0 z-50 mt-2 w-72 origin-top-right rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10 ring-1 ring-black/[0.03]"
                >
                    <div className="flex items-center gap-3 rounded-xl bg-gradient-to-br from-primary-50 to-white p-3">
                        <Avatar
                            src={user?.photoURL}
                            name={user?.displayName}
                            email={user?.email}
                            size={44}
                            ring
                        />
                        <div className="min-w-0">
                            <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-slate-900">
                                <span className="truncate">{displayName}</span>
                                {isPremium && (
                                    <span className="flex-shrink-0 rounded-md bg-gradient-to-r from-amber-400 to-amber-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950">
                                        Pro
                                    </span>
                                )}
                            </p>
                            <p className="truncate text-xs text-slate-500">{subline}</p>
                        </div>
                    </div>

                    <div className="my-2 h-px bg-slate-100" />

                    <MenuLink href={dashboardHref} onSelect={() => setOpen(false)}>
                        <DashboardIcon className="h-4 w-4 text-slate-400" />
                        {dashboardLabel}
                    </MenuLink>
                    <MenuLink href="/dashboard/profile" onSelect={() => setOpen(false)}>
                        <UserIcon className="h-4 w-4 text-slate-400" />
                        Profile &amp; settings
                    </MenuLink>
                    <MenuLink href="/dashboard/orders" onSelect={() => setOpen(false)}>
                        <ReceiptIcon className="h-4 w-4 text-slate-400" />
                        My purchases
                    </MenuLink>

                    <div className="my-2 h-px bg-slate-100" />

                    <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                            setOpen(false);
                            onSignOut();
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-50"
                    >
                        <SignOutIcon className="h-4 w-4 text-rose-500" />
                        Sign out
                    </button>
                </div>
            )}
        </div>
    );
}

function MenuLink({
    href,
    onSelect,
    children,
}: {
    href: string;
    onSelect: () => void;
    children: React.ReactNode;
}) {
    return (
        <Link
            href={href}
            role="menuitem"
            onClick={onSelect}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
            {children}
        </Link>
    );
}

const DashboardIcon = ({ className = "" }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
);

const UserIcon = ({ className = "" }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M4.5 20a7.5 7.5 0 0115 0" />
    </svg>
);

const ReceiptIcon = ({ className = "" }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" />
        <path d="M9 8h6M9 12h6M9 16h3" />
    </svg>
);

const SignOutIcon = ({ className = "" }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3" />
        <path d="M10 17l-5-5 5-5" />
        <path d="M5 12h12" />
    </svg>
);
