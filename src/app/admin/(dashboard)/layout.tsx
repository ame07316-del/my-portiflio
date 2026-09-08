import { redirect } from "next/navigation";
import Sidebar from "@/components/admin/Sidebar";
import { getSession } from "@/lib/auth";
import { getStats } from "@/lib/queries";
import SetupNotice from "@/components/site/SetupNotice";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  let stats;
  try {
    stats = await getStats();
  } catch (error) {
    return <SetupNotice message={(error as Error)?.message} />;
  }

  return (
    <div className="relative min-h-screen bg-ink">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(34,211,238,.10),transparent)]" />
      <div className="relative flex flex-col lg:flex-row">
        <Sidebar
          user={{ name: session.name, email: session.email }}
          unread={stats.unread}
        />
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-9 lg:py-10">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
