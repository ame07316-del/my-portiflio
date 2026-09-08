import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";
import ProjectForm from "@/components/admin/ProjectForm";
import { getProject } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(Number(id));
  if (!project) notFound();

  return (
    <>
      <PageHeader title="Edit project" desc={project.title_en} />
      <ProjectForm project={project} />
    </>
  );
}
