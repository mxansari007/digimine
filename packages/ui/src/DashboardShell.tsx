"use client";

/**
 * Shared dashboard chrome: fixed sidebar on desktop, mobile top bar with
 * hamburger, and a centered scrollable content column. Pair with
 * `AppSidebar` for a complete role-aware layout.
 *
 * The shell owns the desktop "collapsed" state for the sidebar — when the
 * user clicks the rail toggle, the sidebar narrows to an icon-only rail
 * and this component slides the main column over to match. State persists
 * across navigations via `localStorage` so a power user's preference
 * sticks for their whole session.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";

const COLLAPSED_STORAGE_KEY = "pr.sidebar.collapsed";

export interface DashboardSidebarRenderState {
  /** Mobile drawer open? */
  isOpen: boolean;
  /** Close the mobile drawer. */
  onClose: () => void;
  /** Desktop collapsed-rail state. */
  collapsed: boolean;
  /** Toggle the desktop collapsed-rail state. */
  onToggleCollapsed: () => void;
}

export interface DashboardShellProps {
  /**
   * Render-prop for the sidebar. Receives drawer + collapse state so the
   * sidebar can drive its own UI without lifting more state up.
   */
  sidebar: (state: DashboardSidebarRenderState) => ReactNode;
  /** Brand name shown in the mobile top bar. */
  brand?: string;
  /** Used only for soft role-aware dashboard surfaces. */
  role?: "student" | "teacher" | "admin" | "institute";
  children: ReactNode;
}

export function DashboardShell({
  sidebar,
  brand = "PlacementRanker",
  role,
  children,
}: DashboardShellProps) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  // Default to expanded. The real value is hydrated from localStorage in
  // an effect below so SSR markup is stable.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(COLLAPSED_STORAGE_KEY);
      if (stored === "1") setCollapsed(true);
    } catch {
      /* localStorage blocked — fine, fall back to default */
    }
  }, []);

  const onToggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSED_STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return (
    <div
      className="dashboard-professional-theme relative flex min-h-screen"
      data-role={role}
      data-sidebar-collapsed={collapsed ? "true" : "false"}
    >
      {sidebar({
        isOpen: isMobileOpen,
        onClose: () => setIsMobileOpen(false),
        collapsed,
        onToggleCollapsed,
      })}

      <main
        className={
          "flex flex-col min-h-screen relative z-0 min-w-0 flex-1 transition-[margin] duration-200 ease-out " +
          (collapsed ? "lg:ml-[72px]" : "lg:ml-64")
        }
      >
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200/80 bg-white/90 p-4 shadow-sm shadow-slate-900/5 backdrop-blur-xl lg:hidden">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-slate-900">{brand}</span>
          </div>
          <button
            type="button"
            onClick={() => setIsMobileOpen(true)}
            className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-primary-50 dark:hover:bg-primary-500/15 hover:text-primary-800 dark:hover:text-primary-200"
            aria-label="Open sidebar"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
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
