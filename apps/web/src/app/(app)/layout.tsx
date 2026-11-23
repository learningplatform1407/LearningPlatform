import { DailyQuestionProvider } from "@/components/daily-question-overlay";
import { Sidebar } from "@/components/sidebar";
import { QuestionKeysProvider } from "@/components/use-question-keys";
import { LanguageSync } from "@/lib/i18n";
import { ThemeSync } from "@/lib/theme";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    // Above DailyQuestionProvider, because the question of the day it opens
    // takes the number keys too.
    <QuestionKeysProvider>
      <DailyQuestionProvider>
        <div className="flex min-h-screen flex-col md:flex-row">
          <ThemeSync />
          <LanguageSync />
          <Sidebar />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </DailyQuestionProvider>
    </QuestionKeysProvider>
  );
}
