"use client";

import Link from "next/link";
import { useState } from "react";
import type { MyTaskItemDTO } from "@/lib/queries";
import { CheckSquareIcon, HashIcon } from "@/components/ui/Icons";
import styles from "./MyTasksView.module.css";

export function MyTasksView({ tasks }: { tasks: MyTaskItemDTO[] }) {
  const [search, setSearch] = useState("");

  const query = search.trim().toLowerCase();
  const filteredTasks = query
    ? tasks.filter(
        (t) =>
          t.title.toLowerCase().includes(query) ||
          t.key.toLowerCase().includes(query) ||
          t.projectName.toLowerCase().includes(query),
      )
    : tasks;

  // Group tasks by project
  const projectGroups = new Map<string, { name: string; key: string; id: string; tasks: MyTaskItemDTO[] }>();
  for (const t of filteredTasks) {
    if (!projectGroups.has(t.projectId)) {
      projectGroups.set(t.projectId, {
        id: t.projectId,
        name: t.projectName,
        key: t.projectKey,
        tasks: [],
      });
    }
    projectGroups.get(t.projectId)!.tasks.push(t);
  }

  const groupList = Array.from(projectGroups.values());

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>
            <span className={styles.titleIcon}>
              <CheckSquareIcon size={22} />
            </span>
            My Tasks
          </h1>
          <p className={styles.subtitle}>
            All tasks currently assigned to you across projects. Click any task to open it directly.
          </p>
        </div>

        {tasks.length > 0 && (
          <div className={styles.searchWrap}>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search assigned tasks…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
      </div>

      {tasks.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <CheckSquareIcon size={40} />
          </div>
          <h2 className={styles.emptyTitle}>No tasks assigned to you</h2>
          <p className={styles.emptyText}>
            You do not have any tasks assigned to you right now. When teammates assign tasks to you in any project, they will appear here automatically.
          </p>
          <Link href="/projects" className={styles.emptyBtn}>
            Browse Projects
          </Link>
        </div>
      ) : groupList.length === 0 ? (
        <div className={styles.emptyState}>
          <h2 className={styles.emptyTitle}>No matching tasks</h2>
          <p className={styles.emptyText}>No tasks matched “{search}”. Try another search term.</p>
        </div>
      ) : (
        <div className={styles.groups}>
          {groupList.map((group) => (
            <div key={group.id} className={styles.groupCard}>
              <div className={styles.groupHead}>
                <Link href={`/p/${group.id}`} className={styles.groupLink}>
                  <span className={styles.groupBadge}>{group.key}</span>
                  <span className={styles.groupName}>{group.name}</span>
                </Link>
                <span className={styles.groupCount}>
                  {group.tasks.length} {group.tasks.length === 1 ? "task" : "tasks"}
                </span>
              </div>

              <div className={styles.taskList}>
                {group.tasks.map((task) => (
                  <Link
                    key={task.id}
                    href={`/p/${task.projectId}?task=${task.id}`}
                    className={styles.taskRow}
                  >
                    <div className={styles.taskKey}>{task.key}</div>
                    <div className={styles.taskMain}>
                      <div className={styles.taskTitle}>{task.title}</div>
                      {task.description && (
                        <div className={styles.taskDesc}>{task.description}</div>
                      )}
                    </div>

                    <div className={styles.taskMeta}>
                      {task.statusName && (
                        <span
                          className={styles.statusChip}
                          style={
                            task.statusColor
                              ? {
                                  borderColor: `${task.statusColor}44`,
                                  background: `${task.statusColor}18`,
                                }
                              : undefined
                          }
                        >
                          {task.statusColor && (
                            <span
                              className={styles.statusDot}
                              style={{ background: task.statusColor }}
                            />
                          )}
                          {task.statusName}
                        </span>
                      )}

                      <span className={styles.arrowIcon}>→</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
