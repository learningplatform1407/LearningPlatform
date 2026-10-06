"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { getBrowserApiClient } from "@/lib/api-client.browser";

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

// A directory of the content tools, not a second home for them — authoring
// stays inline where the content lives (books/chapters/lectures on the
// Library page), so the parent is always already chosen. See
// docs/architecture/README.md.
const ADMIN_ITEM = { href: "/admin", label: "Admin", emoji: "🛠️" } as const;

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const me = useQuery({ queryKey: ["me"], queryFn: () => getBrowserApiClient().getMe() });

  return (
    <nav
      aria-label="Main"
      className={`sticky top-0 flex h-screen shrink-0 flex-col overflow-y-auto border-r border-border bg-background py-md transition-[width] ${
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
        {me.data?.role === "admin" && (
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
    </nav>
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
        className={`flex h-9 items-center overflow-hidden rounded-md border-l-2 px-sm text-sm font-medium whitespace-nowrap ${
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
