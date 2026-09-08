"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV_ITEMS = [
  { href: "/learn", label: "Learn", emoji: "📖" },
  { href: "/assistant", label: "AI Assistant", emoji: "🤖" },
  { href: "/roadmap", label: "Roadmap", emoji: "🗺️" },
  { href: "/feed", label: "Feed", emoji: "📰" },
] as const;

const PROFILE_ITEM = { href: "/profile", label: "Profile", emoji: "👤" } as const;

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

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
          <NavLink key={item.href} item={item} collapsed={collapsed} active={pathname.startsWith(item.href)} />
        ))}
      </ul>

      <div className="mt-auto flex flex-col gap-xs border-t border-border px-sm pt-md">
        <NavLink item={PROFILE_ITEM} collapsed={collapsed} active={pathname.startsWith(PROFILE_ITEM.href)} />
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
        className={`flex h-9 items-center overflow-hidden rounded-md px-sm text-sm font-medium whitespace-nowrap ${
          collapsed ? "justify-center" : ""
        } ${active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
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
