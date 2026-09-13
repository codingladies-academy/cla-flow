"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { suggestProjectKey } from "@/lib/defaults";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Form";
import { CloseIcon, GlobeIcon, LockIcon } from "@/components/ui/Icons";
import styles from "./NewProjectModal.module.css";

export function NewProjectModal({
  open,
  workspaceId,
  workspaceName,
  onClose,
  onCreated,
}: {
  open: boolean;
  workspaceId: string;
  workspaceName: string;
  onClose: () => void;
  onCreated?: (project: { id: string; name: string; key: string }) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;

    setBusy(true);
    setError(null);

    try {
      const res = await api.post<{ project: { id: string; name: string; key: string } }>(
        "/api/projects",
        {
          name: name.trim(),
          key: key.trim() || suggestProjectKey(name),
          workspaceId,
          isPrivate,
        },
      );

      setName("");
      setKey("");
      setIsPrivate(false);
      onClose();

      if (onCreated) {
        onCreated(res.project);
      } else {
        router.push(`/p/${res.project.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>Create Project</h2>
            <div className={styles.subtitle}>In workspace: {workspaceName}</div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <CloseIcon size={14} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.field}>
            <label className={styles.label}>Project Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Website Redesign, Mobile App"
              required
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>
              Key Prefix <span className={styles.optional}>(e.g. CLA gives CLA-1)</span>
            </label>
            <Input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={name ? suggestProjectKey(name) : "TSK"}
              maxLength={6}
            />
          </div>

          <div className={styles.privacyCard}>
            <label className={styles.privacyLabel}>
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className={styles.checkbox}
              />
              <div className={styles.privacyMeta}>
                <div className={styles.privacyTitle}>
                  {isPrivate ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <LockIcon size={14} /> Private Project
                    </span>
                  ) : (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <GlobeIcon size={14} /> Workspace-wide Project
                    </span>
                  )}
                </div>
                <div className={styles.privacyDescription}>
                  {isPrivate
                    ? "Only specifically invited members can view this project."
                    : "All members of this workspace can view and collaborate on this project."}
                </div>
              </div>
            </label>
          </div>

          <div className={styles.actions}>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
              {busy ? "Creating..." : "Create Project"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
