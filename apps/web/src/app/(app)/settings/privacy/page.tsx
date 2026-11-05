import { PageHeader } from "@/components/page-header";
import { PageMain } from "@/components/page-main";

export default function PrivacySettingsPage() {
  return (
    <PageMain width="reading">
      <PageHeader kicker="Settings" title="Privacy" />
      <p className="mt-sm text-toc text-muted-foreground">Nothing to configure yet.</p>
    </PageMain>
  );
}
