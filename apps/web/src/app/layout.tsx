import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";

import "./globals.css";

import { THEME_INIT_SCRIPT } from "@/lib/theme-script";

import { Providers } from "./providers";

// Variable font, so every weight 400-800 comes from one file. latin-ext for
// Romanian diacritics (ș, ț, ă, î, â) in lesson content.
const figtree = Figtree({
  subsets: ["latin", "latin-ext"],
  variable: "--font-figtree",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LearningPlatform",
  description: "Cross-platform learning and study application.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the page draw under notches/home indicators; globals.css and the
  // edge-glued notches pad themselves with env(safe-area-inset-*).
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the inline script below sets data-theme
    // before React hydrates, so <html> legitimately differs from the server's.
    <html lang="en" className={figtree.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="bg-background text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
