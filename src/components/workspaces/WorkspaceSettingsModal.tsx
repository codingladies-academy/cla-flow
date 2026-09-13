"use client";

import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/client";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Form";
import { CloseIcon } from "@/components/ui/Icons";
import styles from "./WorkspaceSettingsModal.module.css";

type Member = {
  id: string;
  name: string;
  email: string;
  photoUrl: string | null;
  color: string;
  role: string;
};

type StaffSuggestion = {
  id: string;
  name: string;
  email: string;
  photoUrl: string | null;
  color: string;
};

export function WorkspaceSettingsModal({
  open,
  workspace,
  currentUserId,
  onClose,
  onWorkspaceUpdated,
}: {
  open: boolean;
  workspace: { id: string; name: string; iconUrl?: string | null; role: string };
  currentUserId: string;
  onClose: () => void;
  onWorkspaceUpdated?: (updated: { id: string; name: string; iconUrl?: string | null }) => void;
}) {
  const [wsName, setWsName] = useState(workspace.name);
  const [wsIconUrl, setWsIconUrl] = useState(workspace.iconUrl ?? "");
  const [savingWs, setSavingWs] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [allStaff, setAllStaff] = useState<StaffSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffSuggestion | null>(null);
  const [addingRole, setAddingRole] = useState<"member" | "admin">("member");
  const [busy, setBusy] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const canManage = workspace.role === "owner" || workspace.role === "admin";

  useEffect(() => {
    if (!open) return;
    setWsName(workspace.name);
    setWsIconUrl(workspace.iconUrl ?? "");
    setSaveSuccess(false);
    loadMembers();
    loadStaff();
  }, [open, workspace.id, workspace.name, workspace.iconUrl]);

  async function handleSaveWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (!wsName.trim() || savingWs) return;
    setSavingWs(true);
    setError(null);
    setSaveSuccess(false);
    try {
      const res = await api.patch<{ workspace: { id: string; name: string; iconUrl?: string | null } }>(
        `/api/workspaces/${workspace.id}`,
        {
          name: wsName.trim(),
          iconUrl: wsIconUrl.trim() || null,
        },
      );
      setSaveSuccess(true);
      if (onWorkspaceUpdated) {
        onWorkspaceUpdated(res.workspace);
      }
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update workspace.");
    } finally {
      setSavingWs(false);
    }
  }

  async function loadMembers() {
    setLoading(true);
    try {
      const res = await api.get<{ members: Member[] }>(`/api/workspaces/${workspace.id}/members`);
      setMembers(res.members);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load members");
    } finally {
      setLoading(false);
    }
  }

  async function loadStaff() {
    try {
      const res = await api.get<{ staff: StaffSuggestion[] }>("/api/staff");
      setAllStaff(res.staff);
    } catch {}
  }

  const existingMemberIds = new Set(members.map((m) => m.id));
  const suggestions = allStaff.filter(
    (s) =>
      !existingMemberIds.has(s.id) &&
      (s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.email.toLowerCase().includes(searchQuery.toLowerCase())),
  );

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStaff || busy) return;
    setBusy(true);
    try {
      await api.post(`/api/workspaces/${workspace.id}/members`, {
        userId: selectedStaff.id,
        role: addingRole,
      });
      setSelectedStaff(null);
      setSearchQuery("");
      await loadMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveMember(memberId: string) {
    if (!confirm("Are you sure you want to remove this member from the workspace?")) return;
    try {
      await api.del(`/api/workspaces/${workspace.id}/members?userId=${memberId}`);
      await loadMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove member");
    }
  }

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>{wsName}</h2>
            <div className={styles.subtitle}>Workspace Settings & Members</div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <CloseIcon size={14} />
          </button>
        </div>

        <div className={styles.body}>
          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.twoColumnGrid}>
            <div className={styles.leftCol}>
              {canManage ? (
                <div className={styles.detailsSection}>
                  <h3 className={styles.sectionTitle}>Edit Workspace</h3>
                  <form onSubmit={handleSaveWorkspace} className={styles.detailsForm}>
                    <div className={styles.detailsFields}>
                      <div className={styles.previewWrap}>
                        <div className={styles.previewPill}>
                          {wsIconUrl.trim() ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={wsIconUrl.trim()} alt={wsName} className={styles.previewImg} />
                          ) : (
                            <span className={styles.previewInitials}>
                              {wsName.slice(0, 2).toUpperCase() || "WS"}
                            </span>
                          )}
                        </div>
                        <span className={styles.previewHint}>Preview</span>
                      </div>

                      <div className={styles.detailsInputs}>
                        <div className={styles.field}>
                          <label className={styles.fieldLabel}>Workspace Name</label>
                          <Input
                            value={wsName}
                            onChange={(e) => setWsName(e.target.value)}
                            placeholder="Workspace name"
                            required
                          />
                        </div>

                        <div className={styles.field}>
                          <label className={styles.fieldLabel}>Logo / Icon URL (optional)</label>
                          <Input
                            type="url"
                            value={wsIconUrl}
                            onChange={(e) => setWsIconUrl(e.target.value)}
                            placeholder="https://example.com/logo.png"
                          />
                        </div>
                      </div>
                    </div>

                    <div className={styles.detailsActions}>
                      {saveSuccess && <span className={styles.saveSuccess}>✓ Saved successfully!</span>}
                      <Button type="submit" variant="primary" disabled={savingWs || !wsName.trim()}>
                        {savingWs ? "Saving..." : "Save Workspace"}
                      </Button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className={styles.detailsSection}>
                  <h3 className={styles.sectionTitle}>Workspace</h3>
                  <div className={styles.detailsFields}>
                    <div className={styles.previewWrap}>
                      <div className={styles.previewPill}>
                        {wsIconUrl.trim() ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={wsIconUrl.trim()} alt={wsName} className={styles.previewImg} />
                        ) : (
                          <span className={styles.previewInitials}>
                            {wsName.slice(0, 2).toUpperCase() || "WS"}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={styles.detailsInputs}>
                      <div className={styles.field}>
                        <label className={styles.fieldLabel}>Name</label>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{wsName}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className={styles.rightCol}>
              {canManage && (
                <div className={styles.addSection}>
                  <h3 className={styles.sectionTitle}>Add Member</h3>
                  <form onSubmit={handleAddMember} className={styles.addForm}>
                    <div className={styles.inputWrap} ref={dropdownRef}>
                      <Input
                        value={selectedStaff ? `${selectedStaff.name} (${selectedStaff.email})` : searchQuery}
                        onChange={(e) => {
                          setSelectedStaff(null);
                          setSearchQuery(e.target.value);
                          setShowSuggestions(true);
                        }}
                        onFocus={() => setShowSuggestions(true)}
                        placeholder="Search staff by name or email..."
                        className={styles.input}
                      />

                      {showSuggestions && searchQuery.trim() && !selectedStaff && (
                        <div className={styles.suggestions}>
                          {suggestions.length === 0 ? (
                            <div className={styles.noSuggestion}>No matching staff found</div>
                          ) : (
                            suggestions.slice(0, 5).map((s) => (
                              <div
                                key={s.id}
                                className={styles.suggestionItem}
                                onClick={() => {
                                  setSelectedStaff(s);
                                  setShowSuggestions(false);
                                }}
                              >
                                <Avatar name={s.name} color={s.color} size={24} photoUrl={s.photoUrl} />
                                <div className={styles.suggestionMeta}>
                                  <span className={styles.suggestionName}>{s.name}</span>
                                  <span className={styles.suggestionEmail}>{s.email}</span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    <select
                      value={addingRole}
                      onChange={(e) => setAddingRole(e.target.value as "member" | "admin")}
                      className={styles.roleSelect}
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>

                    <Button type="submit" variant="primary" disabled={busy || !selectedStaff}>
                      Add
                    </Button>
                  </form>
                </div>
              )}

              <div className={styles.memberListWrap}>
                <h3 className={styles.sectionTitle}>Members ({members.length})</h3>
                {loading ? (
                  <div className={styles.loading}>Loading members...</div>
                ) : (
                  <div className={styles.list}>
                    {members.map((m) => (
                      <div key={m.id} className={styles.memberRow}>
                        <div className={styles.memberInfo}>
                          <Avatar name={m.name} color={m.color} size={30} photoUrl={m.photoUrl} />
                          <div>
                            <div className={styles.memberName}>
                              {m.name} {m.id === currentUserId && <span className={styles.youBadge}>(You)</span>}
                            </div>
                            <div className={styles.memberEmail}>{m.email}</div>
                          </div>
                        </div>

                        <div className={styles.memberActions}>
                          <span className={`${styles.roleBadge} ${styles[m.role]}`}>{m.role}</span>
                          {canManage && m.id !== currentUserId && m.role !== "owner" && (
                            <button
                              className={styles.removeBtn}
                              onClick={() => handleRemoveMember(m.id)}
                              title="Remove member"
                            >
                              <CloseIcon size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
