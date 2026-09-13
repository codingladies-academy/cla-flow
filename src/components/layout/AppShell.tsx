"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import type { SessionUser } from "@/components/ui/UserMenu";
import { WorkspaceRail, type WorkspaceDTO } from "./WorkspaceRail";
import { WorkspaceSidebar, type SidebarProject } from "./WorkspaceSidebar";
import { NewWorkspaceModal } from "@/components/workspaces/NewWorkspaceModal";
import { WorkspaceSettingsModal } from "@/components/workspaces/WorkspaceSettingsModal";
import { NewProjectModal } from "@/components/workspaces/NewProjectModal";
import { MenuIcon } from "@/components/ui/Icons";
import styles from "./AppShell.module.css";

export function AppShell({
  user,
  initialWorkspaces,
  canCreateWorkspace,
  initialActiveWorkspaceId,
  initialProjects = [],
  children,
}: {
  user: SessionUser;
  initialWorkspaces: WorkspaceDTO[];
  canCreateWorkspace: boolean;
  initialActiveWorkspaceId?: string;
  initialProjects?: SidebarProject[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<WorkspaceDTO[]>(initialWorkspaces);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(() => {
    if (initialActiveWorkspaceId) return initialActiveWorkspaceId;
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("cla_flow_active_ws");
      if (saved && initialWorkspaces.some((w) => w.id === saved)) {
        return saved;
      }
    }
    return initialWorkspaces[0]?.id ?? "";
  });

  const [projects, setProjects] = useState<SidebarProject[]>(initialProjects);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);

  // Sync active workspace to localStorage
  useEffect(() => {
    if (activeWorkspaceId && typeof window !== "undefined") {
      localStorage.setItem("cla_flow_active_ws", activeWorkspaceId);
    }
  }, [activeWorkspaceId]);

  // When activeWorkspaceId changes, fetch projects belonging to it
  useEffect(() => {
    if (!activeWorkspaceId) return;
    let cancelled = false;

    async function loadWorkspaceProjects() {
      try {
        const res = await api.get<{
          projects: Array<{
            id: string;
            name: string;
            key: string;
            isPrivate?: boolean;
            taskCount?: number;
          }>;
        }>(`/api/projects?workspaceId=${activeWorkspaceId}`);

        if (!cancelled) {
          setProjects(
            res.projects.map((p) => ({
              id: p.id,
              name: p.name,
              key: p.key,
              isPrivate: Boolean(p.isPrivate),
              taskCount: p.taskCount ?? 0,
            })),
          );
        }
      } catch {}
    }

    loadWorkspaceProjects();
    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId]);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0] ?? {
    id: "",
    name: "Default Workspace",
    slug: "default",
    ownerId: user.id,
    role: "owner",
    projectCount: 0,
    memberCount: 1,
  };

  function handleWorkspaceSelect(id: string) {
    setActiveWorkspaceId(id);
    router.refresh();
  }

  function handleWorkspaceCreated(newWs: { id: string; name: string; slug: string }) {
    const fullWs: WorkspaceDTO = {
      ...newWs,
      ownerId: user.id,
      role: "owner",
      projectCount: 0,
      memberCount: 1,
    };
    setWorkspaces((prev) => [...prev, fullWs]);
    setActiveWorkspaceId(newWs.id);
    router.refresh();
  }

  function handleProjectCreated(project: { id: string; name: string; key: string }) {
    setProjects((prev) => [
      ...prev,
      {
        id: project.id,
        name: project.name,
        key: project.key,
        isPrivate: false,
        taskCount: 0,
      },
    ]);
    router.push(`/p/${project.id}`);
  }

  function handleWorkspaceUpdated(updated: { id: string; name: string; iconUrl?: string | null }) {
    setWorkspaces((prev) =>
      prev.map((w) =>
        w.id === updated.id ? { ...w, name: updated.name, iconUrl: updated.iconUrl } : w,
      ),
    );
    router.refresh();
  }

  return (
    <div className={styles.shell}>
      <WorkspaceRail
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspace.id}
        onSelectWorkspace={handleWorkspaceSelect}
        onOpenNewWorkspace={() => setNewWorkspaceOpen(true)}
        canCreateWorkspace={canCreateWorkspace}
        user={user}
      />

      <WorkspaceSidebar
        workspace={activeWorkspace}
        projects={projects}
        user={user}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenNewProject={() => setNewProjectOpen(true)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
      />

      <div className={styles.mainContainer}>
        {sidebarCollapsed && (
          <div className={styles.topBar}>
            <button
              className={styles.uncollapseBtn}
              onClick={() => setSidebarCollapsed(false)}
              title="Expand navigation sidebar"
            >
              <MenuIcon size={16} />
              <span className={styles.uncollapseLabel}>Sidebar</span>
            </button>
            <span className={styles.topBarWorkspace}>{activeWorkspace.name}</span>
          </div>
        )}
        <div className={styles.contentWrap}>{children}</div>
      </div>

      <NewWorkspaceModal
        open={newWorkspaceOpen}
        onClose={() => setNewWorkspaceOpen(false)}
        onCreated={handleWorkspaceCreated}
      />

      {activeWorkspace.id && (
        <WorkspaceSettingsModal
          open={settingsOpen}
          workspace={activeWorkspace}
          currentUserId={user.id}
          onClose={() => setSettingsOpen(false)}
          onWorkspaceUpdated={handleWorkspaceUpdated}
        />
      )}

      {activeWorkspace.id && (
        <NewProjectModal
          open={newProjectOpen}
          workspaceId={activeWorkspace.id}
          workspaceName={activeWorkspace.name}
          onClose={() => setNewProjectOpen(false)}
          onCreated={handleProjectCreated}
        />
      )}
    </div>
  );
}
