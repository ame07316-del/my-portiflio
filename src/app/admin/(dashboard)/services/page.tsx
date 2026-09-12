import { PageHeader } from "@/components/admin/PageHeader";
import ServicesManager from "@/components/admin/ServicesManager";
import { getServices } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const services = await getServices();
  return (
    <>
      <PageHeader title="Services" desc="What you offer, in both languages." />
      <ServicesManager services={services} />
    </>
  );
}
