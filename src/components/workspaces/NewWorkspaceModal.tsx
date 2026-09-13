"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Form";
import { CloseIcon } from "@/components/ui/Icons";
import styles from "./NewWorkspaceModal.module.css";

export function NewWorkspaceModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (workspace: { id: string; name: string; slug: string }) => void;
}) {
  const [name, setName] = useState("");
  const [iconUrl, setIconUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;

    setBusy(true);
    setError(null);

    try {
      const res = await api.post<{ workspace: { id: string; name: string; slug: string } }>(
        "/api/workspaces",
        {
          name: name.trim(),
          iconUrl: iconUrl.trim() || undefined,
        },
      );
      setName("");
      setIconUrl("");
      onCreated(res.workspace);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create workspace.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <h2 className={styles.title}>Create Workspace</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <CloseIcon size={14} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <p className={styles.subtitle}>
            A workspace groups related projects, teams, and boards under one organization.
          </p>

          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.field}>
            <label className={styles.label}>Workspace Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Marketing Team, Product Lab"
              required
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>
              Icon / Logo URL <span className={styles.optional}>(optional)</span>
            </label>
            <Input
              type="url"
              value={iconUrl}
              onChange={(e) => setIconUrl(e.target.value)}
              placeholder="https://example.com/logo.png"
            />
          </div>

          <div className={styles.actions}>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
              {busy ? "Creating..." : "Create Workspace"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
