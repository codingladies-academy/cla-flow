import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { canCreateWorkspace, getCurrentUser, isAdmin } from "@/lib/auth";
import { listProjects, listWorkspaces } from "@/lib/queries";
import { ProjectList } from "@/components/projects/ProjectList";
import { AppShell } from "@/components/layout/AppShell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Projects · CLA Flow" };

export default async function ProjectsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const isSuper = isAdmin(user);
  const workspaces = await listWorkspaces(user.id, isSuper);
  const canCreate = await canCreateWorkspace(user);
  const activeWs = workspaces[0];
  const rows = await listProjects(user.id, activeWs?.id);

  return (
    <AppShell
      user={user}
      initialWorkspaces={workspaces}
      canCreateWorkspace={canCreate}
      initialActiveWorkspaceId={activeWs?.id}
      initialProjects={rows.map((r) => ({
        id: r.id,
        name: r.name,
        key: r.key,
        isPrivate: Boolean(r.isPrivate),
        taskCount: r.taskCount,
      }))}
    >
      <ProjectList
        user={user}
        projects={rows.map((r) => ({
          id: r.id,
          name: r.name,
          key: r.key,
          role: r.role,
          isPrivate: Boolean(r.isPrivate),
          taskCount: r.taskCount,
          memberCount: r.memberCount,
        }))}
      />
    </AppShell>
  );
}
