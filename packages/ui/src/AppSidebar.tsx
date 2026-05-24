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

import { useState, type ComponentType, type ReactNode } from "react";
import { Logo } from "./Logo";

/**
 * Image with onError → initials fallback. Some Google/Firebase photoURLs
 * become invalid (token expiry, deleted account, OAuth scope change) and
 * the bare `<img>` then renders the browser's broken-image icon — ugly,
 * and very visible in the sidebar footer. This component swaps to the
 * same circular initials chip we use when no photo is provided.
 */
function AvatarFigure({
  photoURL,
  fallback,
}: {
  photoURL: string | null | undefined;
  fallback: string;
}) {
  const [errored, setErrored] = useState(false);
  const showImg = !!photoURL && !errored;
  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-white text-sm font-bold text-primary-700">
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoURL as string}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setErrored(true)}
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        fallback
      )}
    </div>
  );
}

export type AppSidebarRole = "student" | "teacher" | "admin" | "institute";

export interface AppSidebarNavItem {
  name: string;
  /**
   * Target href. Optional when the item is a group parent (just has children
   * and no destination of its own).
   */
  href?: string;
  icon: ComponentType<{ className?: string }>;
  /** When true, only highlight this item on exact path match (not subpaths). */
  exact?: boolean;
  /**
   * Sub-items rendered indented under the parent. When present, clicking the
   * parent toggles expand/collapse rather than navigating. The parent button
   * shows the "active" tint when ANY child is active.
   */
  children?: AppSidebarNavItem[];
  /** Group starts collapsed by default. When unset, expanded. */
  defaultCollapsed?: boolean;
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
  /** Brand name shown in the header. Defaults to "PlacementRanker". */
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

/**
 * True if `item` or any of its `children` (recursive) matches the current
 * pathname — used to auto-expand a group when the user is on one of its
 * sub-pages, and to tint the parent button.
 */
function itemOrChildActive(item: AppSidebarNavItem, pathname: string): boolean {
  if (item.href && isNavItemActive(pathname, item.href, item.exact)) return true;
  for (const c of item.children || []) {
    if (itemOrChildActive(c, pathname)) return true;
  }
  return false;
}

/** Leaf nav row — a real <Link> to one page. */
function NavLeaf({
  item,
  pathname,
  LinkComponent,
  onClose,
  indented = false,
}: {
  item: AppSidebarNavItem;
  pathname: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  LinkComponent: ComponentType<any>;
  onClose?: () => void;
  indented?: boolean;
}) {
  const Icon = item.icon;
  const isActive = item.href
    ? isNavItemActive(pathname, item.href, item.exact)
    : false;
  return (
    <LinkComponent
      href={item.href || "#"}
      onClick={onClose}
      className={
        (isActive
          ? "relative flex items-center gap-3 rounded-xl border border-primary-200/80 bg-primary-50/80 text-sm font-semibold text-primary-800 shadow-sm shadow-primary-950/5"
          : "relative flex items-center gap-3 rounded-xl border border-transparent text-sm font-medium text-slate-600 transition-colors hover:bg-primary-50/60 hover:text-primary-900") +
        (indented ? " pl-10 pr-4 py-2" : " px-4 py-2.5")
      }
    >
      {indented ? (
        <span className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-50" />
      ) : (
        <Icon className="w-5 h-5" />
      )}
      <span>{item.name}</span>
      {isActive ? (
        <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary-500 shadow-[0_0_10px_rgba(82,109,104,0.18)]" />
      ) : null}
    </LinkComponent>
  );
}

/** Group nav row — a toggleable parent that reveals indented children. */
function NavGroup({
  item,
  pathname,
  LinkComponent,
  onClose,
}: {
  item: AppSidebarNavItem;
  pathname: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  LinkComponent: ComponentType<any>;
  onClose?: () => void;
}) {
  // Auto-expand when the user is somewhere inside the group. After the
  // initial mount, the user controls expansion via the chevron.
  const childActive = (item.children || []).some((c) =>
    itemOrChildActive(c, pathname)
  );
  const [open, setOpen] = useState(
    childActive || !item.defaultCollapsed
  );
  const Icon = item.icon;
  const parentActive = childActive;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={
          parentActive
            ? "relative flex w-full items-center gap-3 rounded-xl border border-primary-200/80 bg-primary-50/40 px-4 py-2.5 text-sm font-semibold text-primary-800"
            : "relative flex w-full items-center gap-3 rounded-xl border border-transparent px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-primary-50/60 hover:text-primary-900"
        }
      >
        <Icon className="w-5 h-5" />
        <span className="flex-1 text-left">{item.name}</span>
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          fill="currentColor"
          className={
            "h-4 w-4 opacity-60 transition-transform " +
            (open ? "rotate-180" : "")
          }
        >
          <path
            fillRule="evenodd"
            d="M5.3 7.3a1 1 0 011.4 0L10 10.6l3.3-3.3a1 1 0 111.4 1.4l-4 4a1 1 0 01-1.4 0l-4-4a1 1 0 010-1.4z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open ? (
        <div className="mt-1 space-y-0.5 border-l border-slate-200/80 ml-5 pl-0">
          {(item.children || []).map((child) => (
            <NavLeaf
              key={child.href || child.name}
              item={child}
              pathname={pathname}
              LinkComponent={LinkComponent}
              onClose={onClose}
              indented
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AppSidebar({
  role,
  pathname,
  nav,
  user,
  LinkComponent = DefaultLink,
  onSignOut,
  brand = "PlacementRanker",
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
          {nav.map((item) =>
            item.children && item.children.length > 0 ? (
              <NavGroup
                key={item.name}
                item={item}
                pathname={pathname}
                LinkComponent={LinkComponent}
                onClose={onClose}
              />
            ) : (
              <NavLeaf
                key={item.href || item.name}
                item={item}
                pathname={pathname}
                LinkComponent={LinkComponent}
                onClose={onClose}
              />
            )
          )}
        </nav>

        <div className="border-t border-slate-200/80 bg-slate-50/60 p-4">
          <div className="mb-3 flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/90 px-3 py-3 shadow-sm shadow-slate-900/5">
            <div className="h-10 w-10 shrink-0 rounded-full bg-primary-100/90 p-[2px] ring-1 ring-primary-200/80">
              <AvatarFigure photoURL={user?.photoURL} fallback={initial} />
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
