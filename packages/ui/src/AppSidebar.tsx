"use client";

/**
 * Unified app sidebar used by all three roles (student / teacher / admin).
 *
 * The sidebar is presentational — it takes a `nav` config, a `user` object,
 * and rendering primitives (Link component, `usePathname`-equivalent) from
 * the caller so it can live in `@digimine/ui` without taking a dependency on
 * Next.js or `firebase/auth` directly.
 *
 * Two desktop modes:
 *   - **Expanded** (default, 256px): full labels, group sections, user
 *     identity card in the footer.
 *   - **Collapsed** (72px rail): icons only with native-tooltip labels.
 *     Groups render as their parent icon — clicking a group icon expands
 *     the sidebar first, then opens the group (so the user lands on a
 *     visible child list rather than a phantom flyout).
 *
 * The `collapsed` + `onToggleCollapsed` state is owned by `DashboardShell`,
 * which is also responsible for sliding the main content over to match
 * the rail width.
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
  /**
   * Where the brand mark links to. The caller should usually point this
   * at the role's home (e.g. `/dashboard` for students, `/teacher/dashboard`
   * for teachers) so the logo behaves as a "back to my home" affordance.
   * Defaults to `/`.
   */
  brandHref?: string;
  /** Mobile drawer state. */
  isOpen?: boolean;
  onClose?: () => void;
  /**
   * Desktop collapsed-rail state. Controlled by `DashboardShell`. When
   * true, the sidebar shrinks to a 72px icon-only rail.
   */
  collapsed?: boolean;
  /** Toggle the collapsed state. Used by the rail toggle button. */
  onToggleCollapsed?: () => void;
  /**
   * Optional control rendered in the sidebar footer (above sign-out) — used
   * by the web app to mount the theme switcher. Left undefined elsewhere
   * (e.g. admin) so the package takes no dependency on app-level components.
   */
  footerExtra?: ReactNode;
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
  collapsed = false,
}: {
  item: AppSidebarNavItem;
  pathname: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  LinkComponent: ComponentType<any>;
  onClose?: () => void;
  indented?: boolean;
  collapsed?: boolean;
}) {
  const Icon = item.icon;
  const isActive = item.href
    ? isNavItemActive(pathname, item.href, item.exact)
    : false;

  // Collapsed rail: render as an icon-only square with tooltip via `title`.
  // Children of a group don't appear in this mode — the group parent is
  // the only entry. Indented leafs simply hide.
  if (collapsed) {
    if (indented) return null;
    return (
      <LinkComponent
        href={item.href || "#"}
        onClick={onClose}
        title={item.name}
        aria-label={item.name}
        className={
          (isActive
            ? "relative flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 dark:bg-primary-500/15 text-primary-700 dark:text-primary-200 shadow-sm shadow-primary-900/5"
            : "relative flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-primary-50/70 dark:hover:bg-primary-500/15 hover:text-primary-800 dark:hover:text-primary-200") +
          " mx-auto"
        }
      >
        <Icon className="w-5 h-5" />
        {isActive ? (
          <span className="absolute -left-3 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary-500" />
        ) : null}
      </LinkComponent>
    );
  }

  return (
    <LinkComponent
      href={item.href || "#"}
      onClick={onClose}
      className={
        (isActive
          ? "relative flex items-center gap-3 rounded-xl border border-primary-200/80 dark:border-primary-500/30 bg-primary-50/80 dark:bg-primary-500/15 text-sm font-semibold text-primary-800 dark:text-primary-200 shadow-sm shadow-primary-950/5"
          : "relative flex items-center gap-3 rounded-xl border border-transparent text-sm font-medium text-slate-600 transition-colors hover:bg-primary-50/60 dark:hover:bg-primary-500/10 hover:text-primary-900 dark:hover:text-primary-200") +
        (indented ? " pl-10 pr-4 py-2" : " px-4 py-2.5")
      }
    >
      {indented ? (
        <span className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-50" />
      ) : (
        <Icon className="w-5 h-5" />
      )}
      <span className="truncate">{item.name}</span>
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
  collapsed = false,
  onToggleCollapsed,
}: {
  item: AppSidebarNavItem;
  pathname: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  LinkComponent: ComponentType<any>;
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
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

  // Collapsed rail: render the group parent as an icon. Clicking it
  // expands the sidebar first (so the user sees the children) and also
  // opens the group locally. Falls back to plain icon when no toggle
  // callback is provided.
  if (collapsed) {
    return (
      <button
        type="button"
        title={item.name}
        aria-label={item.name}
        onClick={() => {
          setOpen(true);
          onToggleCollapsed?.();
        }}
        className={
          (parentActive
            ? "relative flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 dark:bg-primary-500/15 text-primary-700 dark:text-primary-200 shadow-sm shadow-primary-900/5"
            : "relative flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-primary-50/70 dark:hover:bg-primary-500/15 hover:text-primary-800 dark:hover:text-primary-200") +
          " mx-auto"
        }
      >
        <Icon className="w-5 h-5" />
        {parentActive ? (
          <span className="absolute -left-3 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary-500" />
        ) : null}
      </button>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={
          parentActive
            ? "relative flex w-full items-center gap-3 rounded-xl border border-primary-200/80 dark:border-primary-500/30 bg-primary-50/40 dark:bg-primary-500/10 px-4 py-2.5 text-sm font-semibold text-primary-800 dark:text-primary-200"
            : "relative flex w-full items-center gap-3 rounded-xl border border-transparent px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-primary-50/60 dark:hover:bg-primary-500/10 hover:text-primary-900 dark:hover:text-primary-200"
        }
      >
        <Icon className="w-5 h-5" />
        <span className="flex-1 truncate text-left">{item.name}</span>
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

/** Toggle button — half-overlaps the right edge of the sidebar. */
function RailToggle({
  collapsed,
  onClick,
}: {
  collapsed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      // Pin to the divider between the brand header and the nav so the
      // button reads as the seam-handle of the sidebar (matches Linear /
      // Vercel). Lower opacity at rest, brightens on hover.
      className="absolute -right-3 top-[68px] z-20 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm transition-all hover:scale-110 hover:border-primary-300 hover:text-primary-700 lg:flex"
    >
      <svg
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden
        className={
          "h-3.5 w-3.5 transition-transform " + (collapsed ? "" : "rotate-180")
        }
      >
        <path
          fillRule="evenodd"
          d="M7.3 5.3a1 1 0 011.4 0l4 4a1 1 0 010 1.4l-4 4a1 1 0 01-1.4-1.4L10.6 10 7.3 6.7a1 1 0 010-1.4z"
          clipRule="evenodd"
        />
      </svg>
    </button>
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
  brandHref = "/",
  isOpen = false,
  onClose,
  collapsed = false,
  onToggleCollapsed,
  footerExtra,
}: AppSidebarProps) {
  const initial = user?.displayName?.[0]?.toUpperCase() || ROLE_LABEL[role][0];
  // Mobile drawer always renders the full expanded layout; collapsed
  // only applies to the desktop rail. So we treat `collapsed` as false
  // whenever the mobile drawer is open.
  const isRailCollapsed = collapsed;

  return (
    <>
      {isOpen ? (
        <div
          className="fixed inset-0 z-30 bg-overlay/40 backdrop-blur-[2px] transition-opacity duration-300 lg:hidden"
          onClick={onClose}
        />
      ) : null}

      <aside
        className={
          "fixed bottom-0 left-0 top-0 z-40 flex h-full transform flex-col border-r border-slate-200/80 bg-white/95 shadow-sm shadow-slate-900/5 backdrop-blur-xl transition-[width,transform] duration-200 ease-out lg:translate-x-0 " +
          (isRailCollapsed ? "lg:w-[72px] " : "lg:w-64 ") +
          // Mobile drawer is always the full width so labels are readable.
          "w-64 " +
          (isOpen ? "translate-x-0" : "-translate-x-full")
        }
        data-collapsed={isRailCollapsed ? "true" : "false"}
      >
        {/* Toggle pill that hangs off the right edge */}
        {onToggleCollapsed ? (
          <RailToggle collapsed={isRailCollapsed} onClick={onToggleCollapsed} />
        ) : null}

        {/* Fixed-height header so the rail toggle button always lines up
            with the divider line regardless of role-chip width. */}
        <div
          className={
            "relative flex h-[68px] items-center overflow-hidden border-b border-slate-200/80 bg-gradient-to-b from-surface to-surface-muted " +
            (isRailCollapsed ? "justify-center px-3" : "justify-between px-4")
          }
        >
          {/* Brand mark links back to the role's home. In expanded mode the
              logo sits left-aligned with a small uppercase role caption
              underneath the wordmark — same vertical rhythm as the nav
              rows. The loud bordered chip pattern was too "label sticking
              out next to a logo" and is replaced with this caption form. */}
          <LinkComponent
            href={brandHref}
            onClick={onClose}
            aria-label={brand}
            title={brand}
            className={
              "relative z-10 flex items-center rounded-lg outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-primary-300 " +
              (isRailCollapsed ? "" : "gap-2.5")
            }
          >
            {isRailCollapsed ? (
              // Icon-only in the rail. Everything else is dropped so the
              // brand area reads as a neat 40×40 square within the 72px rail.
              <Logo iconSize={26} showText={false} aria-label={brand} />
            ) : (
              <>
                <Logo iconSize={24} showText={false} aria-label={brand} />
                <span className="flex min-w-0 flex-col leading-none">
                  <span
                    className="font-display text-[15px] leading-none"
                    style={{ letterSpacing: "-0.01em" }}
                  >
                    <span className="font-medium text-slate-500">Placement</span>
                    <span className="font-extrabold text-slate-900">Ranker</span>
                  </span>
                  <span className="mt-1 text-[9px] font-bold uppercase tracking-[0.22em] text-primary-600">
                    {ROLE_LABEL[role]}
                  </span>
                </span>
              </>
            )}
          </LinkComponent>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="relative z-10 rounded-lg p-2 text-slate-500 transition-colors hover:bg-primary-50 dark:hover:bg-primary-500/15 hover:text-primary-800 dark:hover:text-primary-200 lg:hidden"
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

        <nav
          className={
            "flex-1 overflow-y-auto " +
            (isRailCollapsed ? "space-y-1 p-2" : "space-y-1.5 p-4")
          }
        >
          {nav.map((item) =>
            item.children && item.children.length > 0 ? (
              <NavGroup
                key={item.name}
                item={item}
                pathname={pathname}
                LinkComponent={LinkComponent}
                onClose={onClose}
                collapsed={isRailCollapsed}
                onToggleCollapsed={onToggleCollapsed}
              />
            ) : (
              <NavLeaf
                key={item.href || item.name}
                item={item}
                pathname={pathname}
                LinkComponent={LinkComponent}
                onClose={onClose}
                collapsed={isRailCollapsed}
              />
            )
          )}
        </nav>

        <div
          className={
            "border-t border-slate-200/80 bg-slate-50/60 " +
            (isRailCollapsed ? "p-2" : "p-4")
          }
        >
          {isRailCollapsed ? (
            <div className="flex flex-col items-center gap-2">
              {footerExtra ? (
                <div className="flex justify-center">{footerExtra}</div>
              ) : null}
              <div
                className="h-10 w-10 shrink-0 rounded-full bg-primary-100/90 dark:bg-primary-500/20 p-[2px] ring-1 ring-primary-200/80 dark:ring-primary-500/30"
                title={user?.displayName || user?.email || ROLE_LABEL[role]}
              >
                <AvatarFigure photoURL={user?.photoURL} fallback={initial} />
              </div>
              {onSignOut ? (
                <button
                  type="button"
                  onClick={() => void onSignOut()}
                  aria-label="Sign out"
                  title="Sign out"
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-200/80 dark:border-red-500/30 bg-red-50/70 dark:bg-red-500/15 text-red-700 dark:text-red-300 transition-colors hover:border-red-300 dark:hover:border-red-500/40 hover:bg-red-50 dark:hover:bg-red-500/25"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4"
                    aria-hidden
                  >
                    <path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3" />
                    <path d="M10 17l-5-5 5-5" />
                    <path d="M5 12h12" />
                  </svg>
                </button>
              ) : null}
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/90 px-3 py-3 shadow-sm shadow-slate-900/5">
                <div className="h-10 w-10 shrink-0 rounded-full bg-primary-100/90 dark:bg-primary-500/20 p-[2px] ring-1 ring-primary-200/80 dark:ring-primary-500/30">
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
              {footerExtra ? (
                <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-surface/60 px-3 py-2">
                  <span className="text-xs font-medium text-slate-500">Appearance</span>
                  {footerExtra}
                </div>
              ) : null}
              {onSignOut ? (
                <button
                  type="button"
                  onClick={() => void onSignOut()}
                  className="flex w-full items-center justify-center rounded-xl border border-red-200/80 dark:border-red-500/30 bg-red-50/70 dark:bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-700 dark:text-red-300 transition-colors hover:border-red-300 dark:hover:border-red-500/40 hover:bg-red-50 dark:hover:bg-red-500/25"
                >
                  Sign Out
                </button>
              ) : null}
            </>
          )}
        </div>
      </aside>
    </>
  );
}
