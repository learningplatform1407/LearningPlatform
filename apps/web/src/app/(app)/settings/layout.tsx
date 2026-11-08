"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { useI18n } from "@/lib/i18n";

const SECTIONS = [
  { href: "/settings/account", label: "settings.sections.account" },
  { href: "/settings/privacy", label: "settings.sections.privacy" },
  { href: "/settings/billing", label: "settings.sections.billing" },
  { href: "/settings/notifications", label: "settings.sections.notifications" },
  { href: "/settings/languages", label: "settings.sections.languages" },
  { href: "/settings/appearance", label: "settings.sections.appearance" },
  { href: "/settings/profile", label: "settings.sections.profile" },
] as const;

/** Each settings section is its own route (not a tab over client state) so
 * that visiting one, sharing a link to it, or hitting browser back/forward
 * all behave the way every other page in this app already does. This layout
 * supplies the small left nav every section page shares; each page under it
 * stays a normal self-contained `<main>`, same as the rest of the app. */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();

  return (
    <div className="flex flex-col md:flex-row">
      <nav
        aria-label={t("settings.sectionsLabel")}
        className="border-b border-border px-md pt-[22px] pb-md md:sticky md:top-0 md:h-screen md:w-56 md:shrink-0 md:overflow-y-auto md:border-r md:border-b-0 md:pr-3 md:pl-3.5"
      >
        <h2 className="label-caps mb-3 ml-1.5">{t("settings.title")}</h2>
        <ul className="flex flex-wrap gap-0.5 md:flex-col md:flex-nowrap">
          {SECTIONS.map((section) => {
            const active = pathname === section.href;
            return (
              <li key={section.href}>
                <Link
                  href={section.href}
                  aria-current={active ? "page" : undefined}
                  className={`block rounded-sm px-2 py-1.5 text-toc leading-[1.3] font-semibold ${
                    active
                      ? "bg-muted font-extrabold text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {t(section.label)}
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
