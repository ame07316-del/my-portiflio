import { PageHeader } from "@/components/admin/PageHeader";
import SkillsManager from "@/components/admin/SkillsManager";
import { getSkills } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function SkillsPage() {
  const skills = await getSkills();
  return (
    <>
      <PageHeader title="Skills" desc="The stack shown in the Capabilities section." />
      <SkillsManager skills={skills} />
    </>
  );
}
