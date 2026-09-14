"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { SessionUser } from "@/components/ui/UserMenu";
import {
  CheckSquareIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  EditIcon,
  GridIcon,
  HashIcon,
  LockIcon,
  PlusIcon,
  SettingsIcon,
} from "@/components/ui/Icons";
import styles from "./WorkspaceSidebar.module.css";

export type SidebarProject = {
  id: string;
  name: string;
  key: string;
  isPrivate: boolean;
  taskCount?: number;
  role?: string;
  memberCount?: number;
};

export function WorkspaceSidebar({
  workspace,
  projects,
  user,
  onOpenSettings,
  onOpenNewProject,
  collapsed,
  onToggleCollapse,
  myTaskCount = 0,
  onCloseMobile,
  onNavigate,
}: {
  workspace: { id: string; name: string; slug: string; role: string };
  projects: SidebarProject[];
  user: SessionUser;
  onOpenSettings: () => void;
  onOpenNewProject: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  myTaskCount?: number;
  onCloseMobile?: () => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav
      className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ""}`}
      aria-label="Workspace Navigation"
    >
      <div className={styles.header}>
        <div
          className={styles.workspaceSelector}
          onClick={() => setMenuOpen((o) => !o)}
          role="button"
          tabIndex={0}
        >
          <div className={styles.headerMeta}>
            <div className={styles.workspaceName}>
              <span>{workspace.name}</span>
              <span className={styles.chevron}>▾</span>
            </div>
            <div className={styles.userStatus}>
              <span className={styles.onlineDot} />
              <span className={styles.userName}>{user.name}</span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            type="button"
            className={styles.newProjectIconBtn}
            onClick={onOpenSettings}
            title="Edit Workspace"
            aria-label="Edit Workspace"
          >
            <EditIcon size={14} />
          </button>

          {onCloseMobile && (
            <button
              type="button"
              className={styles.mobileCloseBtn}
              onClick={onCloseMobile}
              title="Close navigation"
              aria-label="Close navigation"
            >
              <CloseIcon size={14} />
            </button>
          )}
        </div>

        {menuOpen && (
          <>
            <div className={styles.menuBackdrop} onClick={() => setMenuOpen(false)} />
            <div className={styles.dropdownMenu}>
              <div className={styles.dropdownHeader}>
                <strong>{workspace.name}</strong>
                <span className={styles.dropdownRole}>Role: {workspace.role}</span>
              </div>
              <div className={styles.menuDivider} />
              <button
                className={styles.menuItem}
                onClick={() => {
                  setMenuOpen(false);
                  onOpenSettings();
                }}
              >
                <EditIcon size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
                Edit Workspace & Members
              </button>
              <button
                className={styles.menuItem}
                onClick={() => {
                  setMenuOpen(false);
                  onOpenNewProject();
                }}
              >
                <PlusIcon size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
                New Project
              </button>
            </div>
          </>
        )}
      </div>

      <div className={styles.content}>
        <div className={styles.section}>
          <Link
            href="/projects"
            className={`${styles.navItem} ${pathname === "/projects" ? styles.navItemActive : ""}`}
            onClick={onNavigate}
          >
            <span className={styles.itemIcon}>
              <GridIcon size={15} />
            </span>
            <span className={styles.itemLabel}>All Projects</span>
            <span className={styles.badge}>{projects.length}</span>
          </Link>

          <Link
            href="/my-tasks"
            className={`${styles.navItem} ${pathname === "/my-tasks" ? styles.navItemActive : ""}`}
            onClick={onNavigate}
          >
            <span className={styles.itemIcon}>
              <CheckSquareIcon size={15} />
            </span>
            <span className={styles.itemLabel}>My Tasks</span>
            {myTaskCount > 0 && <span className={styles.taskBadge}>{myTaskCount}</span>}
          </Link>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Projects</span>
            <button
              type="button"
              className={styles.sectionAddBtn}
              onClick={onOpenNewProject}
              title="Add Project"
            >
              <PlusIcon size={13} />
            </button>
          </div>

          <div className={styles.projectList}>
            {projects.length === 0 ? (
              <div className={styles.emptyProjects}>
                No projects yet.
                <button className={styles.createFirstBtn} onClick={onOpenNewProject}>
                  <PlusIcon size={12} style={{ marginRight: 4, verticalAlign: "middle" }} />
                  Create one
                </button>
              </div>
            ) : (
              projects.map((proj) => {
                const href = `/p/${proj.id}`;
                const isActive = pathname.startsWith(href);

                return (
                  <Link
                    key={proj.id}
                    href={href}
                    className={`${styles.projectItem} ${isActive ? styles.projectItemActive : ""}`}
                    onClick={onNavigate}
                  >
                    <span className={styles.projectSymbol}>
                      {proj.isPrivate ? <LockIcon size={13} /> : <HashIcon size={13} />}
                    </span>
                    <span className={styles.projectName} title={proj.name}>
                      {proj.name}
                    </span>
                    {typeof proj.taskCount === "number" && proj.taskCount > 0 && (
                      <span className={styles.projectCount}>{proj.taskCount}</span>
                    )}
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.collapseToggle}
          onClick={onToggleCollapse}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRightIcon size={14} />
          ) : (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <ChevronLeftIcon size={14} /> Collapse Sidebar
            </span>
          )}
        </button>
      </div>
    </nav>
  );
}
