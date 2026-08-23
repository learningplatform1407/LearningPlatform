import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LearningPlatform",
  description: "Cross-platform learning and study application.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
