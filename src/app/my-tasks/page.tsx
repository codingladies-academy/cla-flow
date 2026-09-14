import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { canCreateWorkspace, getCurrentUser, isAdmin } from "@/lib/auth";
import { listMyTasks, listProjects, listWorkspaces } from "@/lib/queries";
import { AppShell } from "@/components/layout/AppShell";
import { MyTasksView } from "@/components/tasks/MyTasksView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My Tasks · CLA Flow" };

export default async function MyTasksPage({
  searchParams,
}: {
  searchParams?: Promise<{ workspaceId?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const isSuper = isAdmin(user);
  const [workspaces, canCreate, myTasks] = await Promise.all([
    listWorkspaces(user.id, isSuper),
    canCreateWorkspace(user),
    listMyTasks(user.id),
  ]);

  const params = searchParams ? await searchParams : {};
  const cookieStore = await cookies();
  const savedWsId = params.workspaceId || cookieStore.get("cla_flow_active_ws")?.value;

  const activeWs =
    (savedWsId ? workspaces.find((w) => w.id === savedWsId) : null) ?? workspaces[0];
  const rows = await listProjects(user.id, activeWs?.id);

  return (
    <AppShell
      user={user}
      initialWorkspaces={workspaces}
      canCreateWorkspace={canCreate}
      initialActiveWorkspaceId={activeWs?.id}
      myTaskCount={myTasks.length}
      initialProjects={rows.map((r) => ({
        id: r.id,
        name: r.name,
        key: r.key,
        role: r.role,
        memberCount: r.memberCount,
        isPrivate: Boolean(r.isPrivate),
        taskCount: r.taskCount,
      }))}
    >
      <MyTasksView tasks={myTasks} />
    </AppShell>
  );
}
