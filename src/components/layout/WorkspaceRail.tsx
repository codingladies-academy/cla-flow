"use client";

import { useTheme } from "@/lib/theme";
import { Avatar } from "@/components/ui/Avatar";
import { UserMenu, type SessionUser } from "@/components/ui/UserMenu";
import { MoonIcon, PlusIcon, SunIcon } from "@/components/ui/Icons";
import styles from "./WorkspaceRail.module.css";

export type WorkspaceDTO = {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  iconUrl?: string | null;
  role: string;
  projectCount: number;
  memberCount: number;
};

export function WorkspaceRail({
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onOpenNewWorkspace,
  canCreateWorkspace,
  user,
}: {
  workspaces: WorkspaceDTO[];
  activeWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
  onOpenNewWorkspace: () => void;
  canCreateWorkspace: boolean;
  user: SessionUser;
}) {
  const { theme, toggle: toggleTheme } = useTheme();

  function getInitials(name: string) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  return (
    <aside className={styles.rail} aria-label="Workspaces">
      <div className={styles.workspaceList}>
        {workspaces.map((ws) => {
          const isActive = ws.id === activeWorkspaceId;
          const initials = getInitials(ws.name);

          return (
            <div key={ws.id} className={styles.itemWrap}>
              <div className={`${styles.activeIndicator} ${isActive ? styles.activeIndicatorOn : ""}`} />
              <button
                type="button"
                className={`${styles.wsButton} ${isActive ? styles.wsButtonActive : ""}`}
                onClick={() => onSelectWorkspace(ws.id)}
                title={`${ws.name} (${ws.projectCount} projects)`}
                aria-current={isActive ? "page" : undefined}
              >
                {ws.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ws.iconUrl} alt={ws.name} className={styles.wsIcon} />
                ) : (
                  <span className={styles.wsInitials}>{initials}</span>
                )}
              </button>
            </div>
          );
        })}

        {canCreateWorkspace && (
          <div className={styles.itemWrap}>
            <button
              type="button"
              className={styles.addWorkspaceBtn}
              onClick={onOpenNewWorkspace}
              title="Add a Workspace"
              aria-label="Add a Workspace"
            >
              <PlusIcon size={18} />
            </button>
          </div>
        )}
      </div>

      <div className={styles.bottomSection}>
        <button
          type="button"
          className={styles.toolBtn}
          onClick={toggleTheme}
          title={theme === "light" ? "Switch to Dark mode" : "Switch to Light mode"}
          aria-label="Toggle Theme"
        >
          {theme === "light" ? <MoonIcon size={16} /> : <SunIcon size={16} />}
        </button>

        <div className={styles.userWrap}>
          <UserMenu user={user} compact placement="top-right" />
        </div>
      </div>
    </aside>
  );
}
