import { PageHeader } from "@/components/admin/PageHeader";
import ExperienceManager from "@/components/admin/ExperienceManager";
import { getExperiences } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ExperiencePage() {
  const items = await getExperiences();
  return (
    <>
      <PageHeader title="Experience" desc="Your journey timeline." />
      <ExperienceManager items={items} />
    </>
  );
}
