import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { canCreateWorkspace, getCurrentUser, requireMembership, HttpError, isAdmin } from "@/lib/auth";
import { listProjects, listWorkspaces, loadBoard } from "@/lib/queries";
import { BoardApp } from "@/components/board/BoardApp";
import { AppShell } from "@/components/layout/AppShell";

export const dynamic = "force-dynamic";

/** The tab says which board it is, so three open boards can be told apart. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<Metadata> {
  const user = await getCurrentUser();
  if (!user) return { title: "CLA Flow" };
  const { projectId } = await params;
  try {
    const { projectName } = await requireMembership(user.id, projectId);
    return { title: `${projectName} · CLA Flow` };
  } catch {
    return { title: "CLA Flow" };
  }
}

export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ task?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { projectId } = await params;
  const { task } = await searchParams;

  let role: string;
  try {
    role = (await requireMembership(user.id, projectId)).role;
  } catch (err) {
    if (err instanceof HttpError) notFound();
    throw err;
  }

  const isSuper = isAdmin(user);
  const [board, workspaces, canCreate] = await Promise.all([
    loadBoard(projectId, role),
    listWorkspaces(user.id, isSuper),
    canCreateWorkspace(user),
  ]);

  const projectWs =
    workspaces.find(
      (w) => w.id === (board.project as { workspaceId?: string }).workspaceId,
    ) ?? workspaces[0];

  const wsProjects = await listProjects(user.id, projectWs?.id);

  return (
    <AppShell
      user={user}
      initialWorkspaces={workspaces}
      canCreateWorkspace={canCreate}
      initialActiveWorkspaceId={projectWs?.id}
      initialProjects={wsProjects.map((p) => ({
        id: p.id,
        name: p.name,
        key: p.key,
        isPrivate: Boolean(p.isPrivate),
        taskCount: p.taskCount,
      }))}
    >
      <BoardApp initial={board} user={user} initialTask={task ?? null} />
    </AppShell>
  );
}
