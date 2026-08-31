"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV_ITEMS = [
  { href: "/lectures", label: "Lectures" },
  { href: "/assistant", label: "AI Assistant" },
  { href: "/roadmap", label: "Roadmap" },
  { href: "/feed", label: "Feed" },
] as const;

const PROFILE_ITEM = { href: "/profile", label: "Profile" } as const;

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <nav
      aria-label="Main"
      className={`flex h-screen shrink-0 flex-col border-r border-border bg-background py-md transition-[width] ${
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
  item: { href: string; label: string };
  collapsed: boolean;
  active: boolean;
}) {
  return (
    <li>
      <Link
        href={item.href}
        title={collapsed ? item.label : undefined}
        className={`flex h-9 items-center overflow-hidden rounded-md px-sm text-sm font-medium whitespace-nowrap ${
          active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        {collapsed ? item.label.slice(0, 2).toUpperCase() : item.label}
      </Link>
    </li>
  );
}
