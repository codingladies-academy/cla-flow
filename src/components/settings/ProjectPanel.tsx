"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useBoard } from "@/components/board/store";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { Card, Note, Row, Spacer, Tag } from "@/components/ui/Layout";
import { PageHead } from "./SettingsShell";
import styles from "./settings.module.css";

type WorkspaceDTO = {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  role: string;
  iconUrl?: string | null;
};

export function ProjectPanel() {
  const { data, user, notify, refresh } = useBoard();
  const router = useRouter();
  const isOwner = data.project.role === "owner";

  const [name, setName] = useState(data.project.name);
  const [key, setKey] = useState(data.project.key);
  const [confirmText, setConfirmText] = useState("");
  const [confirming, setConfirming] = useState(false);

  // Workspace move state
  const [workspaces, setWorkspaces] = useState<WorkspaceDTO[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [targetWsId, setTargetWsId] = useState<string>("");
  const [confirmingMove, setConfirmingMove] = useState(false);
  const [moving, setMoving] = useState(false);
  const [loadingWs, setLoadingWs] = useState(true);

  const taskCount = data.tasks.length;
  const keyChanged = key !== data.project.key && key.length > 0;

  useEffect(() => {
    let active = true;
    api
      .get<{ workspaces: WorkspaceDTO[]; isSuperAdmin?: boolean }>("/api/workspaces")
      .then((res) => {
        if (!active) return;
        setWorkspaces(res.workspaces);
        if (res.isSuperAdmin) setIsSuperAdmin(true);
        const other = res.workspaces.filter((w) => w.id !== data.project.workspaceId);
        if (other.length > 0) {
          setTargetWsId(other[0].id);
        }
      })
      .catch((err) => {
        console.error("Failed to load workspaces:", err);
      })
      .finally(() => {
        if (active) setLoadingWs(false);
      });
    return () => {
      active = false;
    };
  }, [data.project.workspaceId]);

  const currentWs = workspaces.find((w) => w.id === data.project.workspaceId);
  const canMove =
    isSuperAdmin ||
    currentWs?.role === "owner" ||
    (currentWs && currentWs.ownerId === user.id);
  const candidateWorkspaces = workspaces.filter((w) => w.id !== data.project.workspaceId);
  const targetWs = workspaces.find((w) => w.id === targetWsId);

  async function handleMoveProject() {
    if (!targetWsId || moving) return;
    setMoving(true);
    try {
      await api.patch(`/api/projects/${data.project.id}`, { workspaceId: targetWsId });
      notify(`Project moved to ${targetWs?.name ?? "the new workspace"}.`);
      setConfirmingMove(false);
      await refresh();
      router.refresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not move project.");
    } finally {
      setMoving(false);
    }
  }

  async function save(patch: { name?: string; key?: string }) {
    try {
      await api.patch(`/api/projects/${data.project.id}`, patch);
      await refresh();
      router.refresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not save.");
      setName(data.project.name);
      setKey(data.project.key);
    }
  }

  async function remove() {
    try {
      await api.del(`/api/projects/${data.project.id}`);
      router.replace("/projects");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not delete the project.");
    }
  }

  return (
    <>
      <PageHead title="Project" note="The name on the board and the prefix on every task key." />

      <Card>
        <Row>
          <Field label="Name" inline>
            <Input
              style={{ flex: 1, minWidth: 160 }}
              aria-label="Project name"
              value={name}
              disabled={!isOwner}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                const trimmed = name.trim();
                if (!trimmed) return setName(data.project.name);
                if (trimmed !== data.project.name) void save({ name: trimmed });
              }}
            />
          </Field>
        </Row>
        <Row>
          <Field label="Key" inline>
            <Input
              style={{ width: 110 }}
              aria-label="Project key"
              value={key}
              maxLength={6}
              disabled={!isOwner}
              onChange={(e) => setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              onBlur={() => {
                if (!key) return setKey(data.project.key);
                if (key !== data.project.key) void save({ key });
              }}
            />
            <Note>Task keys look like {key || "USH"}-14.</Note>
          </Field>
        </Row>
        {/*
         * A task key is built from this prefix, never stored. Changing it
         * renames every task at once, which breaks every link somebody pasted
         * and every key an agent was told to work on.
         */}
        {keyChanged && taskCount > 0 && (
          <Row>
            <span className={styles.keyWarn} role="alert">
              ⚠ {taskCount} {taskCount === 1 ? "task is" : "tasks are"} called {data.project.key}-…
              today. Leaving this box renames all of them. Links and agent instructions that use the
              old key stop working.
            </span>
          </Row>
        )}
        {!isOwner && (
          <Row>
            <Note>Only the owner can change the name and the key.</Note>
          </Row>
        )}
      </Card>

      <div style={{ marginTop: 28 }}>
        <PageHead
          title="Workspace"
          note="Which workspace this project belongs to. Moving it transfers all board tasks, views, and properties."
        />
      </div>

      <Card>
        <Row>
          <Field label="Current" inline>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontWeight: 600, color: "var(--text-primary, #fff)" }}>
                {currentWs?.name ?? (loadingWs ? "Loading..." : "Workspace")}
              </span>
              {currentWs?.role && <Tag>{currentWs.role}</Tag>}
            </div>
          </Field>
        </Row>

        {canMove ? (
          <>
            {candidateWorkspaces.length > 0 ? (
              <>
                <Row>
                  <Field label="Move to" inline>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <Select
                        value={targetWsId}
                        onChange={(e) => {
                          setTargetWsId(e.target.value);
                          setConfirmingMove(false);
                        }}
                        disabled={confirmingMove || moving}
                        style={{ minWidth: 200 }}
                      >
                        {candidateWorkspaces.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name} {w.role ? `(${w.role})` : ""}
                          </option>
                        ))}
                      </Select>
                      {!confirmingMove && (
                        <Button
                          variant="primary"
                          disabled={!targetWsId || moving}
                          onClick={() => setConfirmingMove(true)}
                        >
                          Move Project
                        </Button>
                      )}
                    </div>
                  </Field>
                </Row>

                {confirmingMove && (
                  <Row>
                    <Note>
                      Move <b>{data.project.name}</b> to <b>{targetWs?.name}</b>?
                    </Note>
                    <Button
                      variant="primary"
                      disabled={moving}
                      onClick={() => void handleMoveProject()}
                    >
                      {moving ? "Moving..." : "Confirm Move"}
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={moving}
                      onClick={() => setConfirmingMove(false)}
                    >
                      Cancel
                    </Button>
                  </Row>
                )}
              </>
            ) : (
              <Row>
                <Note>No other workspaces available to move this project to.</Note>
              </Row>
            )}
          </>
        ) : (
          <Row>
            <Note>Only workspace owners and super admins can move this project to another workspace.</Note>
          </Row>
        )}
      </Card>

      {isOwner && (
        <div className={styles.danger}>
          <span className={styles.dangerHead}>Delete this project</span>
          <Note>
            The board, its {taskCount} {taskCount === 1 ? "task" : "tasks"}, its properties, its
            views and its agents go with it. There is no undo.
          </Note>
          {confirming ? (
            <div className={styles.dangerRow}>
              <Note>
                Type <b>{data.project.key}</b> to confirm.
              </Note>
              <Input
                autoFocus
                style={{ width: 110 }}
                aria-label="Type the project key to confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
              />
              <Button
                variant="danger"
                disabled={confirmText !== data.project.key}
                onClick={() => void remove()}
              >
                Delete for good
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setConfirming(false);
                  setConfirmText("");
                }}
              >
                Cancel
              </Button>
              <Spacer />
            </div>
          ) : (
            <div className={styles.dangerRow}>
              <Button variant="danger" onClick={() => setConfirming(true)}>
                Delete project
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
