"use client";

/**
 * Unified app sidebar used by all three roles (student / teacher / admin).
 *
 * The sidebar is presentational — it takes a `nav` config, a `user` object,
 * and rendering primitives (Link component, `usePathname`-equivalent) from
 * the caller so it can live in `@digimine/ui` without taking a dependency on
 * Next.js or `firebase/auth` directly.
 *
 * Theme is a shared light professional look across all roles.
 */

import type { ComponentType, ReactNode } from "react";
import { Logo } from "./Logo";

export type AppSidebarRole = "student" | "teacher" | "admin" | "institute";

export interface AppSidebarNavItem {
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  /** When true, only highlight this item on exact path match (not subpaths). */
  exact?: boolean;
}

interface AppSidebarUser {
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
}

export interface AppSidebarProps {
  role: AppSidebarRole;
  /** Current pathname for active-link highlighting. */
  pathname: string;
  /** Nav items to render. */
  nav: AppSidebarNavItem[];
  /** Profile shown in the footer. */
  user: AppSidebarUser | null;
  /**
   * Link component to use for navigation. Default is an `<a>` tag —
   * apps using Next.js should pass `next/link` for client-side routing.
   * Typed loosely so both plain anchors and `next/link` (with its
   * `Url`-typed href and richer onClick signature) are structurally
   * compatible without pulling Next types into this package.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  LinkComponent?: ComponentType<any>;
  /** Optional sign-out handler — when omitted the button is hidden. */
  onSignOut?: () => void | Promise<void>;
  /** Brand name shown in the header. Defaults to "Digimine". */
  brand?: string;
  /** Mobile drawer state. */
  isOpen?: boolean;
  onClose?: () => void;
}

const ROLE_LABEL: Record<AppSidebarRole, string> = {
  student: "STUDENT",
  teacher: "TEACHER",
  admin: "ADMIN",
  institute: "INSTITUTE",
};

function normalizePath(value: string) {
  const path = value.split("?")[0].split("#")[0] || "/";
  if (path.length > 1) return path.replace(/\/+$/, "");
  return "/";
}

function isNavItemActive(pathname: string, href: string, exact?: boolean) {
  const current = normalizePath(pathname);
  const target = normalizePath(href);

  if (target === "/") return current === "/";
  if (exact) return current === target;
  return current === target || current.startsWith(`${target}/`);
}

function DefaultLink({
  href,
  onClick,
  className,
  children,
}: {
  href: string;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a href={href} onClick={onClick} className={className}>
      {children}
    </a>
  );
}

export function AppSidebar({
  role,
  pathname,
  nav,
  user,
  LinkComponent = DefaultLink,
  onSignOut,
  brand = "Digimine",
  isOpen = false,
  onClose,
}: AppSidebarProps) {
  const initial = user?.displayName?.[0]?.toUpperCase() || ROLE_LABEL[role][0];

  return (
    <>
      {isOpen ? (
        <div
          className="fixed inset-0 z-30 bg-slate-950/20 backdrop-blur-[2px] transition-opacity duration-300 lg:hidden"
          onClick={onClose}
        />
      ) : null}

      <aside
        className={
          "fixed bottom-0 left-0 top-0 z-40 flex h-full w-64 transform flex-col border-r border-slate-200/80 bg-white/90 shadow-sm shadow-slate-900/5 backdrop-blur-xl transition-transform duration-300 ease-out lg:translate-x-0 " +
          (isOpen ? "translate-x-0" : "-translate-x-full")
        }
      >
        <div className="relative flex items-center justify-between overflow-hidden border-b border-slate-200/80 bg-gradient-to-b from-white/90 to-slate-50/80 p-5 lg:justify-center">
          <div className="relative z-10 flex items-center gap-3">
            {/* Brand mark — same gem used in headers / marketing. The `brand`
                prop is kept for back-compat but only used as the accessible
                label; the rendered word is now part of the Logo component. */}
            <Logo iconSize={26} aria-label={brand} />
            <span className="hidden rounded-full border border-primary-200 bg-primary-50 px-2 py-0.5 text-[10px] font-bold text-primary-700 sm:inline-block">
              {ROLE_LABEL[role]}
            </span>
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="relative z-10 rounded-lg p-2 text-slate-500 transition-colors hover:bg-primary-50 hover:text-primary-800 lg:hidden"
              aria-label="Close sidebar"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          ) : null}
        </div>

        <nav className="flex-1 space-y-1.5 overflow-y-auto p-4">
          {nav.map((item) => {
            const isActive = isNavItemActive(pathname, item.href, item.exact);
            const Icon = item.icon;
            return (
              <LinkComponent
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={
                  isActive
                    ? "relative flex items-center gap-3 rounded-xl border border-primary-200/80 bg-primary-50/80 px-4 py-2.5 text-sm font-semibold text-primary-800 shadow-sm shadow-primary-950/5"
                    : "relative flex items-center gap-3 rounded-xl border border-transparent px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-primary-50/60 hover:text-primary-900"
                }
              >
                <Icon className="w-5 h-5" />
                <span>{item.name}</span>
                {isActive ? (
                  <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary-500 shadow-[0_0_10px_rgba(82,109,104,0.18)]" />
                ) : null}
              </LinkComponent>
            );
          })}
        </nav>

        <div className="border-t border-slate-200/80 bg-slate-50/60 p-4">
          <div className="mb-3 flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/90 px-3 py-3 shadow-sm shadow-slate-900/5">
            <div className="h-10 w-10 shrink-0 rounded-full bg-primary-100/90 p-[2px] ring-1 ring-primary-200/80">
              <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-white text-sm font-bold text-primary-700">
                {user?.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt=""
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  initial
                )}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">
                {user?.displayName ||
                  `${ROLE_LABEL[role][0]}${ROLE_LABEL[role].slice(1).toLowerCase()}`}
              </p>
              <p className="truncate text-xs text-slate-500">{user?.email}</p>
            </div>
          </div>
          {onSignOut ? (
            <button
              type="button"
              onClick={() => void onSignOut()}
              className="flex w-full items-center justify-center rounded-xl border border-red-200/80 bg-red-50/70 px-4 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:border-red-300 hover:bg-red-50"
            >
              Sign Out
            </button>
          ) : null}
        </div>
      </aside>
    </>
  );
}
