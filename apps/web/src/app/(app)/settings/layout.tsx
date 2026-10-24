"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const SECTIONS = [
  { href: "/settings/account", label: "Account" },
  { href: "/settings/privacy", label: "Privacy" },
  { href: "/settings/billing", label: "Subscription & Billing" },
  { href: "/settings/notifications", label: "Notifications" },
  { href: "/settings/languages", label: "Languages" },
  { href: "/settings/appearance", label: "Appearance" },
  { href: "/settings/profile", label: "Profile Settings" },
] as const;

/** Each settings section is its own route (not a tab over client state) so
 * that visiting one, sharing a link to it, or hitting browser back/forward
 * all behave the way every other page in this app already does. This layout
 * supplies the small left nav every section page shares; each page under it
 * stays a normal self-contained `<main>`, same as the rest of the app. */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col md:flex-row">
      <nav
        aria-label="Settings sections"
        className="border-b border-border p-lg md:w-48 md:shrink-0 md:border-r md:border-b-0"
      >
        <ul className="flex flex-col gap-xs">
          {SECTIONS.map((section) => {
            const active = pathname === section.href;
            return (
              <li key={section.href}>
                <Link
                  href={section.href}
                  className={`block rounded-md px-sm py-xs text-sm font-medium ${
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {section.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
