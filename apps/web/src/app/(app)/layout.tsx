import { Sidebar } from "@/components/sidebar";
import { ThemeSync } from "@/lib/theme";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <ThemeSync />
      <Sidebar />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
