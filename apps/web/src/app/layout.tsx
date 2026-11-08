import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";

import "./globals.css";

import { getServerTranslator } from "@/lib/i18n.server";
import { THEME_INIT_SCRIPT } from "@/lib/theme-script";

import { Providers } from "./providers";

// Variable font, so every weight 400-800 comes from one file. latin-ext for
// Romanian diacritics (ș, ț, ă, î, â) in lesson content.
const figtree = Figtree({
  subsets: ["latin", "latin-ext"],
  variable: "--font-figtree",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslator();
  return { title: t("common.appName"), description: t("common.appDescription") };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the page draw under notches/home indicators; globals.css and the
  // edge-glued notches pad themselves with env(safe-area-inset-*).
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read on the server, unlike the theme: text has to be in the reader's
  // language in the first paint, and an inline script can't translate it.
  // This makes every page render per request, which the signed-in pages --
  // all client-fetched behind the proxy's session check -- barely notice.
  const { language } = await getServerTranslator();

  return (
    // suppressHydrationWarning: the inline script below sets data-theme
    // before React hydrates, so <html> legitimately differs from the server's.
    <html lang={language} className={figtree.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="bg-background text-foreground antialiased">
        <Providers initialLanguage={language}>{children}</Providers>
      </body>
    </html>
  );
}
