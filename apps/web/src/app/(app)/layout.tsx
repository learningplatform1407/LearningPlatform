import { Sidebar } from "@/components/sidebar";
import { LanguageSync } from "@/lib/i18n";
import { ThemeSync } from "@/lib/theme";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <ThemeSync />
      <LanguageSync />
      <Sidebar />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
