"use client";

/**
 * Shared dashboard chrome: fixed sidebar on desktop, mobile top bar with
 * hamburger, and a centered scrollable content column. Pair with
 * `AppSidebar` for a complete role-aware layout.
 */

import { useState, type ReactNode } from "react";

export interface DashboardShellProps {
  /**
   * Render-prop for the sidebar. Receives `isOpen` + `onClose` so the
   * sidebar can drive its own mobile drawer state.
   */
  sidebar: (state: { isOpen: boolean; onClose: () => void }) => ReactNode;
  /** Brand name shown in the mobile top bar. */
  brand?: string;
  /** Used only for soft role-aware dashboard surfaces. */
  role?: "student" | "teacher" | "admin" | "institute";
  children: ReactNode;
}

export function DashboardShell({
  sidebar,
  brand = "Digimine",
  role,
  children,
}: DashboardShellProps) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <div
      className="dashboard-professional-theme relative flex min-h-screen"
      data-role={role}
    >
      {sidebar({ isOpen: isMobileOpen, onClose: () => setIsMobileOpen(false) })}

      <main className="flex-1 lg:ml-64 flex flex-col min-h-screen relative z-0 min-w-0">
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200/80 bg-white/90 p-4 shadow-sm shadow-slate-900/5 backdrop-blur-xl lg:hidden">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-slate-900">{brand}</span>
          </div>
          <button
            type="button"
            onClick={() => setIsMobileOpen(true)}
            className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-primary-50 hover:text-primary-800"
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
