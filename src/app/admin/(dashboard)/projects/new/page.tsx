import { PageHeader } from "@/components/admin/PageHeader";
import ProjectForm from "@/components/admin/ProjectForm";

export const dynamic = "force-dynamic";

export default function NewProjectPage() {
  return (
    <>
      <PageHeader title="New project" desc="Publish a new piece of work." />
      <ProjectForm />
    </>
  );
}
