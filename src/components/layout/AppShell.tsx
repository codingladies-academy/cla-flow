"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { playNotificationSound, sendDesktopNotification } from "@/lib/audio";
import type { SessionUser } from "@/components/ui/UserMenu";
import { WorkspaceRail, type WorkspaceDTO } from "./WorkspaceRail";
import { WorkspaceSidebar, type SidebarProject } from "./WorkspaceSidebar";
import { NewWorkspaceModal } from "@/components/workspaces/NewWorkspaceModal";
import { WorkspaceSettingsModal } from "@/components/workspaces/WorkspaceSettingsModal";
import { NewProjectModal } from "@/components/workspaces/NewProjectModal";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { MenuIcon } from "@/components/ui/Icons";
import styles from "./AppShell.module.css";

export type WorkspaceContextType = {
  activeWorkspace: WorkspaceDTO;
  activeWorkspaceId: string;
  projects: SidebarProject[];
  selectWorkspace: (id: string) => void;
  openNewProject: () => void;
  openSettings: () => void;
  openChat: () => void;
};

export const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

export function useWorkspace() {
  return useContext(WorkspaceContext);
}

export function AppShell({
  user,
  initialWorkspaces,
  canCreateWorkspace,
  initialActiveWorkspaceId,
  initialProjects = [],
  myTaskCount = 0,
  children,
}: {
  user: SessionUser;
  initialWorkspaces: WorkspaceDTO[];
  canCreateWorkspace: boolean;
  initialActiveWorkspaceId?: string;
  initialProjects?: SidebarProject[];
  myTaskCount?: number;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
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
  const [chatOpen, setChatOpen] = useState(false);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const prevUnreadRef = useRef<number>(-1);

  // Tab Title Badge & Notifications
  useEffect(() => {
    if (typeof document === "undefined") return;

    // Clean existing title of any previous (N) badge
    const current = document.title.replace(/^\(\d+\)\s*/, "");
    if (chatUnreadCount > 0) {
      document.title = `(${chatUnreadCount}) ${current}`;
    } else {
      document.title = current;
    }
  }, [chatUnreadCount, pathname]);

  // Periodically check for unread chat messages
  useEffect(() => {
    let cancelled = false;
    async function checkUnread() {
      try {
        const url = activeWorkspaceId
          ? `/api/chat/rooms?workspaceId=${activeWorkspaceId}`
          : "/api/chat/rooms";
        const res = await api.get<{
          globalRoom: { unreadCount: number };
          workspaceRooms: Array<{ unreadCount: number }>;
          directRooms: Array<{ unreadCount: number }>;
        }>(url);

        if (!cancelled) {
          const total =
            (res.globalRoom?.unreadCount ?? 0) +
            (res.workspaceRooms?.reduce((sum, r) => sum + (r.unreadCount ?? 0), 0) ?? 0) +
            (res.directRooms?.reduce((sum, r) => sum + (r.unreadCount ?? 0), 0) ?? 0);

          if (prevUnreadRef.current !== -1 && total > prevUnreadRef.current) {
            playNotificationSound();
            sendDesktopNotification("CLA Flow Chat", `You have ${total} unread messages.`, () =>
              setChatOpen(true),
            );
          }
          prevUnreadRef.current = total;
          setChatUnreadCount(total);
        }
      } catch {}
    }

    checkUnread();
    const timer = setInterval(checkUnread, 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeWorkspaceId]);

  // Sync state if server passes updated activeWorkspaceId or projects
  useEffect(() => {
    if (initialActiveWorkspaceId && initialActiveWorkspaceId !== activeWorkspaceId) {
      setActiveWorkspaceId(initialActiveWorkspaceId);
    }
  }, [initialActiveWorkspaceId]);

  useEffect(() => {
    if (initialProjects && initialProjects.length > 0) {
      setProjects(initialProjects);
    }
  }, [initialProjects]);

  // Auto-close mobile drawer on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Sync active workspace to localStorage and cookie
  useEffect(() => {
    if (activeWorkspaceId) {
      if (typeof window !== "undefined") {
        localStorage.setItem("cla_flow_active_ws", activeWorkspaceId);
      }
      if (typeof document !== "undefined") {
        document.cookie = `cla_flow_active_ws=${activeWorkspaceId}; path=/; max-age=31536000; SameSite=Lax`;
      }
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
            role?: string;
            memberCount?: number;
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
              role: p.role ?? "member",
              memberCount: p.memberCount ?? 1,
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
    if (typeof document !== "undefined") {
      document.cookie = `cla_flow_active_ws=${id}; path=/; max-age=31536000; SameSite=Lax`;
    }
    if (typeof window !== "undefined") {
      localStorage.setItem("cla_flow_active_ws", id);
    }
    router.push(`/projects?workspaceId=${id}`);
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
    handleWorkspaceSelect(newWs.id);
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
        role: "owner",
        memberCount: 1,
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
    <WorkspaceContext.Provider
      value={{
        activeWorkspace,
        activeWorkspaceId: activeWorkspace.id,
        projects,
        selectWorkspace: handleWorkspaceSelect,
        openNewProject: () => setNewProjectOpen(true),
        openSettings: () => setSettingsOpen(true),
        openChat: () => setChatOpen(true),
      }}
    >
      <div className={styles.shell}>
        {/* Mobile drawer backdrop */}
        {mobileOpen && (
          <div
            className={styles.backdrop}
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Navigation drawer (desktop: inline rail + sidebar, mobile: off-canvas drawer) */}
        <div className={`${styles.navDrawer} ${mobileOpen ? styles.navDrawerOpen : ""}`}>
          <WorkspaceRail
            workspaces={workspaces}
            activeWorkspaceId={activeWorkspace.id}
            onSelectWorkspace={(id) => {
              handleWorkspaceSelect(id);
              setMobileOpen(false);
            }}
            onOpenNewWorkspace={() => {
              setNewWorkspaceOpen(true);
              setMobileOpen(false);
            }}
            canCreateWorkspace={canCreateWorkspace}
            user={user}
          />

          <WorkspaceSidebar
            workspace={activeWorkspace}
            projects={projects}
            user={user}
            onOpenSettings={() => {
              setSettingsOpen(true);
              setMobileOpen(false);
            }}
            onOpenNewProject={() => {
              setNewProjectOpen(true);
              setMobileOpen(false);
            }}
            onOpenChat={() => setChatOpen(true)}
            chatUnreadCount={chatUnreadCount}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
            myTaskCount={myTaskCount}
            onCloseMobile={() => setMobileOpen(false)}
            onNavigate={() => setMobileOpen(false)}
          />
        </div>

        <div className={styles.mainContainer}>
          {/* Mobile top bar visible on small screens */}
          <div className={styles.mobileTopBar}>
            <button
              type="button"
              className={styles.mobileMenuBtn}
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
            >
              <MenuIcon size={18} />
            </button>
            <div className={styles.mobileWorkspaceTitle}>
              <span className={styles.mobileWsBadge}>
                {activeWorkspace.name.slice(0, 2).toUpperCase()}
              </span>
              <span className={styles.mobileWsName}>{activeWorkspace.name}</span>
            </div>
          </div>

          {/* Desktop uncollapse bar when sidebar is collapsed */}
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

        <ChatPanel
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          user={user}
          activeWorkspaceId={activeWorkspace.id}
          activeWorkspaceName={activeWorkspace.name}
          onUnreadCountChange={(c) => setChatUnreadCount(c)}
        />
      </div>
    </WorkspaceContext.Provider>
  );
}
