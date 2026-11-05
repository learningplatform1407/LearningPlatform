import { PageHeader } from "@/components/page-header";
import { PageMain } from "@/components/page-main";

export default function AssistantPage() {
  return (
    <PageMain width="reading">
      <PageHeader kicker="Coming soon" title="AI Assistant" />
      <p className="mt-sm text-toc text-muted-foreground">Coming soon.</p>
    </PageMain>
  );
}
