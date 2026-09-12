import { PageHeader } from "@/components/admin/PageHeader";
import SettingsForm from "@/components/admin/SettingsForm";
import { getSettings } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getSettings();
  return (
    <>
      <PageHeader
        title="Site settings"
        desc="Every word and colour on the public site lives here."
      />
      <SettingsForm settings={settings} />
    </>
  );
}
