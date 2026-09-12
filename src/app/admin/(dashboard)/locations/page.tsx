import { PageHeader } from "@/components/admin/PageHeader";
import LocationsManager from "@/components/admin/LocationsManager";
import { getLocations } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function LocationsPage() {
  const locations = await getLocations();
  return (
    <>
      <PageHeader
        title="Globe locations"
        desc="Every pin on the 3D globe — your home base and the cities you work with."
      />
      <LocationsManager locations={locations} />
    </>
  );
}
