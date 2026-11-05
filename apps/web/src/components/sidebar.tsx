"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ComponentType } from "react";

import { Dot } from "@/components/dot";
import {
  BookIcon,
  CloseIcon,
  ExamIcon,
  FeedIcon,
  MapIcon,
  MenuIcon,
  MoonIcon,
  SparkleIcon,
  SunIcon,
  UserIcon,
  WrenchIcon,
} from "@/components/icons";
import { getBrowserApiClient } from "@/lib/api-client.browser";
import { useTheme } from "@/lib/theme";
import { useDismissableOverlay } from "@/lib/use-dismissable-overlay";

type NavItem = { href: string; label: string; Icon: ComponentType<{ size?: number }> };

// Question Bank has no entry of its own here — it's reached from inside
// Learn (its card on /learn, and the per-lesson tab), the same way Review
// and Flashcards are. Promoting it to a top-level item would say it's a
// peer of Learn rather than part of it.
const NAV_ITEMS: readonly NavItem[] = [
  { href: "/learn", label: "Learn", Icon: BookIcon },
  { href: "/exams", label: "Exam Hub", Icon: ExamIcon },
  { href: "/assistant", label: "AI Assistant", Icon: SparkleIcon },
  { href: "/roadmap", label: "Roadmap", Icon: MapIcon },
  { href: "/feed", label: "Feed", Icon: FeedIcon },
];

const PROFILE_ITEM: NavItem = { href: "/profile", label: "Profile", Icon: UserIcon };

// A directory of the content tools: the two bulk importers,
// question-of-the-day, and (unlike mobile, where it stays inline on the
// Library page) library authoring itself. See docs/architecture/README.md.
const ADMIN_ITEM: NavItem = { href: "/admin", label: "Admin", Icon: WrenchIcon };

// A lesson owns the whole screen in the redesign: its left edge belongs to
// the tool notch and table of contents, and it carries its own way back.
const LESSON_ROUTE = /^\/learn\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const me = useQuery({ queryKey: ["me"], queryFn: () => getBrowserApiClient().getMe() });
  const isAdmin = me.data?.role === "admin";

  // Closing the drawer on navigation is state adjustment during render
  // (the same pattern settings/profile/page.tsx's `syncedFrom` uses), not an
  // effect -- an effect reacting to `pathname` would set state one render
  // after the route actually changed, flashing the drawer open over the new
  // page for a frame.
  const [previousPathname, setPreviousPathname] = useState(pathname);
  if (pathname !== previousPathname) {
    setPreviousPathname(pathname);
    setMobileOpen(false);
  }

  useDismissableOverlay(mobileOpen, () => setMobileOpen(false));

  if (LESSON_ROUTE.test(pathname)) return null;

  return (
    <>
      {/* Below `md` the sidebar would eat most of a phone's width, so it
          becomes a menu dot and an off-canvas drawer -- the breakpoint the
          mobile app itself switches on (apps/mobile/src/app/(app)/_layout.tsx). */}
      <div className="sticky top-[env(safe-area-inset-top,0px)] z-10 flex h-14 shrink-0 items-center bg-background px-md md:hidden">
        <Dot size="sm" aria-label="Open menu" onClick={() => setMobileOpen(true)}>
          <MenuIcon />
        </Dot>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-scrim/60"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <nav
            aria-label="Mobile menu"
            className="absolute top-0 left-0 flex h-full w-[280px] max-w-[85vw] animate-[drawer-in-left_0.25s_ease] motion-reduce:animate-none flex-col overflow-y-auto border-r border-border bg-background pt-[calc(22px+env(safe-area-inset-top,0px))] pr-3 pb-[22px] pl-3.5"
          >
            <div className="mb-3 flex items-center justify-between pl-1.5">
              <span className="label-caps">Menu</span>
              <Dot size="xs" aria-label="Close menu" onClick={() => setMobileOpen(false)}>
                <CloseIcon size={16} />
              </Dot>
            </div>

            <NavList collapsed={false} isAdmin={isAdmin} pathname={pathname} />
          </nav>
        </div>
      )}

      <nav
        aria-label="Main"
        className={`sticky top-0 hidden h-screen shrink-0 flex-col overflow-y-auto border-r border-border bg-background py-[22px] transition-[width] duration-[250ms] md:flex ${
          collapsed ? "w-[3.75rem] px-2" : "w-[15rem] pr-3 pl-3.5"
        }`}
      >
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`mb-3 flex h-[31px] w-[31px] items-center justify-center rounded-sm text-[22px] leading-none font-semibold text-muted-foreground hover:bg-muted hover:text-foreground ${
            collapsed ? "self-center" : "ml-0.5"
          }`}
        >
          {collapsed ? "›" : "‹"}
        </button>

        <NavList collapsed={collapsed} isAdmin={isAdmin} pathname={pathname} />
      </nav>
    </>
  );
}

// Shared by the desktop sidebar and the mobile drawer -- both show the same
// items, differing only in whether the icon-only collapsed treatment applies
// (never on mobile, where there's no space constraint forcing it).
function NavList({
  collapsed,
  isAdmin,
  pathname,
}: {
  collapsed: boolean;
  isAdmin: boolean;
  pathname: string;
}) {
  return (
    <>
      <ul className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            collapsed={collapsed}
            active={pathname.startsWith(item.href)}
          />
        ))}
        {/* Appended conditionally rather than added to NAV_ITEMS, which is
            the list every learner sees. /admin is the one exception to the
            comment above: it is not part of Learn, it is a directory of the
            content tools, and it only exists for admins. */}
        {isAdmin && (
          <NavLink
            item={ADMIN_ITEM}
            collapsed={collapsed}
            active={pathname.startsWith(ADMIN_ITEM.href)}
          />
        )}
      </ul>

      <div className="mt-auto flex flex-col gap-0.5 border-t border-border pt-3">
        <ul>
          <NavLink
            item={PROFILE_ITEM}
            collapsed={collapsed}
            active={pathname.startsWith(PROFILE_ITEM.href) || pathname.startsWith("/settings")}
          />
        </ul>
        <ThemeToggle collapsed={collapsed} />
      </div>
    </>
  );
}

const ITEM_CLASSES =
  "flex h-9 w-full items-center gap-2.5 overflow-hidden rounded-sm px-2 text-toc leading-[1.3] font-semibold whitespace-nowrap transition-colors";

function NavLink({
  item,
  collapsed,
  active,
}: {
  item: NavItem;
  collapsed: boolean;
  active: boolean;
}) {
  const { Icon } = item;
  return (
    <li>
      <Link
        href={item.href}
        title={collapsed ? item.label : undefined}
        aria-label={collapsed ? item.label : undefined}
        aria-current={active ? "page" : undefined}
        className={`${ITEM_CLASSES} ${collapsed ? "justify-center" : ""} ${
          active
            ? "bg-muted font-extrabold text-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        <Icon />
        {!collapsed && item.label}
      </Link>
    </li>
  );
}

/** The design's moon dot, as a nav row. Saves to the user's settings, so
 * the choice follows them to other devices (and the Appearance page). */
function ThemeToggle({ collapsed }: { collapsed: boolean }) {
  const { resolved, setPreference } = useTheme();
  const next = resolved === "dark" ? "light" : "dark";
  const label = next === "dark" ? "Dark theme" : "Light theme";
  return (
    <button
      type="button"
      onClick={() => setPreference(next, { persist: true })}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
      className={`${ITEM_CLASSES} text-muted-foreground hover:bg-muted hover:text-foreground ${
        collapsed ? "justify-center" : ""
      }`}
    >
      {next === "dark" ? <MoonIcon /> : <SunIcon />}
      {!collapsed && label}
    </button>
  );
}
