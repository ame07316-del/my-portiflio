import { redirect } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";
import AccountForms from "@/components/admin/AccountForms";
import { getAdminToken, getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  const token = await getAdminToken();

  return (
    <>
      <PageHeader
        title="Access"
        desc="The token that unlocks this dashboard."
      />
      <AccountForms
        user={{ name: session.name, email: session.email }}
        token={token}
      />
    </>
  );
}
