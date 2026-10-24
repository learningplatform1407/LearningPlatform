"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { getBrowserApiClient } from "@/lib/api-client.browser";
import { useDismissableOverlay } from "@/lib/use-dismissable-overlay";

// Question Bank has no entry of its own here — it's reached from inside
// Learn (its card on /learn, and the per-lesson tab), the same way Review
// and Flashcards are. Promoting it to a top-level item would say it's a
// peer of Learn rather than part of it.
const NAV_ITEMS = [
  { href: "/learn", label: "Learn", emoji: "📖" },
  { href: "/exams", label: "Exam Hub", emoji: "📝" },
  { href: "/assistant", label: "AI Assistant", emoji: "🤖" },
  { href: "/roadmap", label: "Roadmap", emoji: "🗺️" },
  { href: "/feed", label: "Feed", emoji: "📰" },
] as const;

const PROFILE_ITEM = { href: "/profile", label: "Profile", emoji: "👤" } as const;

// A directory of the content tools: the two bulk importers,
// question-of-the-day, and (unlike mobile, where it stays inline on the
// Library page) library authoring itself. See docs/architecture/README.md.
const ADMIN_ITEM = { href: "/admin", label: "Admin", emoji: "🛠️" } as const;

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const me = useQuery({ queryKey: ["me"], queryFn: () => getBrowserApiClient().getMe() });
  const isAdmin = me.data?.role === "admin";

  // Below `md` the sticky sidebar below is hidden entirely (it would eat
  // most of a phone's width) in favor of this top bar + an off-canvas
  // drawer, matching the breakpoint the mobile app itself switches on
  // (apps/mobile/src/app/(app)/_layout.tsx's TABLET_BREAKPOINT).
  //
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

  return (
    <>
      <div className="sticky top-0 z-10 flex h-14 shrink-0 items-center border-b border-border bg-background px-sm md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="flex h-9 w-9 items-center justify-center rounded-md text-foreground hover:bg-muted"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            className="h-5 w-5"
            aria-hidden="true"
          >
            <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-20 md:hidden">
          <div className="absolute inset-0 bg-foreground/40" onClick={() => setMobileOpen(false)} />
          <nav
            aria-label="Mobile menu"
            className="absolute top-0 left-0 flex h-full w-[16rem] flex-col overflow-y-auto bg-background py-md shadow-md"
          >
            <div className="mb-md flex items-center justify-between px-md">
              <span className="text-sm font-semibold text-foreground">Menu</span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
              >
                <span aria-hidden="true" className="text-lg leading-none">
                  ×
                </span>
              </button>
            </div>

            <NavList collapsed={false} isAdmin={isAdmin} pathname={pathname} />
          </nav>
        </div>
      )}

      <nav
        aria-label="Main"
        className={`sticky top-0 hidden h-screen shrink-0 flex-col overflow-y-auto border-r border-border bg-background py-md transition-[width] md:flex ${
          collapsed ? "w-[3.5rem]" : "w-[14rem]"
        }`}
      >
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="mx-sm mb-md flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
        >
          {collapsed ? "»" : "«"}
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
      <ul className="flex flex-col gap-xs px-sm">
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

      <div className="mt-auto flex flex-col gap-xs border-t border-border px-sm pt-md">
        <NavLink
          item={PROFILE_ITEM}
          collapsed={collapsed}
          active={pathname.startsWith(PROFILE_ITEM.href)}
        />
      </div>
    </>
  );
}

function NavLink({
  item,
  collapsed,
  active,
}: {
  item: { href: string; label: string; emoji: string };
  collapsed: boolean;
  active: boolean;
}) {
  return (
    <li>
      <Link
        href={item.href}
        title={collapsed ? item.label : undefined}
        aria-label={collapsed ? item.label : undefined}
        className={`flex h-9 items-center overflow-hidden rounded-md border-l-2 px-sm text-sm font-semibold whitespace-nowrap ${
          collapsed ? "justify-center" : ""
        } ${
          active
            ? "border-primary bg-primary/5 text-primary"
            : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        {collapsed ? (
          <span aria-hidden="true" className="text-base leading-none">
            {item.emoji}
          </span>
        ) : (
          item.label
        )}
      </Link>
    </li>
  );
}
