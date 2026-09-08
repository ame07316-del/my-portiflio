import { redirect } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";
import AccountForms from "@/components/admin/AccountForms";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await getSession();
  if (!session) redirect("/admin/login");

  return (
    <>
      <PageHeader title="Account" desc="Your admin credentials." />
      <AccountForms user={{ name: session.name, email: session.email }} />
    </>
  );
}
