"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client";
import styles from "./admin.module.css";

type UserRow = {
  id: string;
  email: string;
  name: string;
  color: string;
  photoUrl: string | null;
  userType: "staff" | "volunteer";
  lastActiveAt?: string | null;
  createdAt: string;
};

export function AdminPanel({
  adminName,
  currentUserId,
}: {
  adminName: string;
  currentUserId?: string;
}) {
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter tab state: "all" | "staff" | "volunteer"
  const [filterTab, setFilterTab] = useState<"all" | "staff" | "volunteer">("all");

  // Create form state
  const [userType, setUserType] = useState<"staff" | "volunteer">("staff");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdInfo, setCreatedInfo] = useState<{
    email: string;
    password: string;
    userType: "staff" | "volunteer";
    emailSent: boolean;
  } | null>(null);
  const [createdCopied, setCreatedCopied] = useState(false);

  function generatePassword() {
    const chars = "abcdefghjkmnpqrstuvwxyz23456789";
    let part1 = "";
    let part2 = "";
    for (let i = 0; i < 4; i++) {
      part1 += chars[Math.floor(Math.random() * chars.length)];
      part2 += chars[Math.floor(Math.random() * chars.length)];
    }
    setPassword(`CLA-${part1}-${part2}`);
  }

  // Main Section Tab state: "users" | "properties"
  const [activeSection, setActiveSection] = useState<"users" | "properties">("users");

  // Project Templates / Terminology state
  const [templateProps, setTemplateProps] = useState<
    Array<{
      name: string;
      originalName?: string;
      type: string;
      options?: Array<{ name: string; originalName?: string; color: string }>;
    }>
  >([]);
  const [templateViews, setTemplateViews] = useState<
    Array<{ name: string; originalName?: string; kind: string; groupBy: string | null }>
  >([]);
  const [workspacesList, setWorkspacesList] = useState<Array<{ id: string; name: string }>>([]);
  const [syncScope, setSyncScope] = useState<"global" | string>("global");
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Reset password dialog state
  const [resetUser, setResetUser] = useState<UserRow | null>(null);
  const [customPassword, setCustomPassword] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{
    password: string;
    emailSent: boolean;
    emailError?: string | null;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ users: UserRow[] }>("/api/admin/users");
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    try {
      const data = await api.get<{
        defaultProperties: Array<{
          name: string;
          type: string;
          options?: Array<{ name: string; color: string }>;
        }>;
        defaultViews: Array<{ name: string; kind: string; groupBy: string | null }>;
        workspaces: Array<{ id: string; name: string }>;
      }>("/api/admin/templates");

      setTemplateProps(
        data.defaultProperties.map((p) => ({
          ...p,
          originalName: p.name,
          options: p.options?.map((o) => ({ ...o, originalName: o.name })),
        })),
      );
      setTemplateViews(
        data.defaultViews.map((v) => ({ ...v, originalName: v.name })),
      );
      setWorkspacesList(data.workspaces || []);
    } catch (err) {
      console.error("Failed to load templates:", err);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadTemplates();
  }, [load, loadTemplates]);

  async function handleSyncTemplates(e: React.FormEvent) {
    e.preventDefault();
    setSyncing(true);
    setSyncResult(null);
    setSyncError(null);

    const propertyRenames: Array<{ oldName: string; newName: string }> = [];
    const optionRenames: Array<{ propertyName: string; oldName: string; newName: string; color?: string }> = [];
    const viewRenames: Array<{ oldName: string; newName: string }> = [];

    for (const p of templateProps) {
      if (p.originalName && p.name !== p.originalName) {
        propertyRenames.push({ oldName: p.originalName, newName: p.name });
      }
      if (p.options) {
        for (const opt of p.options) {
          if (opt.originalName && opt.name !== opt.originalName) {
            optionRenames.push({
              propertyName: p.originalName || p.name,
              oldName: opt.originalName,
              newName: opt.name,
              color: opt.color,
            });
          }
        }
      }
    }

    for (const v of templateViews) {
      if (v.originalName && v.name !== v.originalName) {
        viewRenames.push({ oldName: v.originalName, newName: v.name });
      }
    }

    try {
      const scopePayload =
        syncScope === "global" ? "global" : { workspaceId: syncScope };

      const res = await api.post<{ ok: boolean; message: string; updatedProjectsCount: number }>(
        "/api/admin/templates",
        {
          scope: scopePayload,
          propertyRenames,
          optionRenames,
          viewRenames,
        },
      );

      setSyncResult(res.message);
      // Update original names to current state
      setTemplateProps((prev) =>
        prev.map((p) => ({
          ...p,
          originalName: p.name,
          options: p.options?.map((o) => ({ ...o, originalName: o.name })),
        })),
      );
      setTemplateViews((prev) =>
        prev.map((v) => ({ ...v, originalName: v.name })),
      );
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Failed to synchronize terminology.");
    } finally {
      setSyncing(false);
    }
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    setCreatedInfo(null);
    try {
      const res = await api.post<{
        user: { id: string; email: string; name: string; userType: "staff" | "volunteer" };
        password: string;
        emailSent: boolean;
      }>("/api/admin/users", {
        name,
        email,
        password: password.trim() || undefined,
        photoUrl: photoUrl.trim() || undefined,
        userType,
      });
      setCreatedInfo({
        email: res.user.email,
        password: res.password,
        userType: res.user.userType || userType,
        emailSent: res.emailSent,
      });
      setName("");
      setEmail("");
      setPassword("");
      setPhotoUrl("");
      void load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not create account.");
    } finally {
      setCreating(false);
    }
  }

  async function toggleUserType(userId: string, currentType: "staff" | "volunteer") {
    const nextType = currentType === "volunteer" ? "staff" : "volunteer";
    try {
      const res = await api.patch<{ user: UserRow }>(`/api/admin/users/${userId}`, {
        userType: nextType,
      });
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, userType: res.user.userType } : u)),
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not update user type.");
      void load();
    }
  }

  async function updatePhotoUrl(userId: string, newUrl: string) {
    const trimmed = newUrl.trim();
    try {
      const res = await api.patch<{ user: UserRow }>(`/api/admin/users/${userId}`, {
        photoUrl: trimmed || null,
      });
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, photoUrl: res.user.photoUrl } : u))
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not update photo URL.");
      void load();
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetUser) return;
    setResetting(true);
    setResetError(null);
    try {
      const res = await api.post<{
        success: boolean;
        password: string;
        emailSent: boolean;
        emailError?: string | null;
      }>(`/api/admin/users/${resetUser.id}/reset-password`, {
        password: customPassword.trim() || undefined,
        sendEmail,
      });
      setResetResult(res);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Failed to reset password.");
    } finally {
      setResetting(false);
    }
  }

  async function deleteUser(userId: string, userName: string) {
    if (userId === currentUserId) {
      alert("You cannot delete your own account.");
      return;
    }
    if (!confirm(`Delete ${userName}'s account? This cannot be undone.`)) return;
    try {
      await api.del(`/api/admin/users/${userId}`);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not delete user.");
    }
  }

  return (
    <div className={styles.page}>
      {/* Top bar */}
      <div className={styles.bar}>
        <img
          src="https://codingladies.org/favicon.ico"
          alt="CLA Flow"
          className={styles.logo}
        />
        <span className={styles.brand}>CLA Flow</span>
        <span className={styles.badge}>Admin</span>
        <span style={{ flex: 1 }} />
        <Link href="/projects" className={styles.back}>← Back to projects</Link>
        <Link href="/account" className={styles.accountLink}>{adminName}</Link>
      </div>

      <div className={styles.body}>
        {/* Main Navigation Switcher */}
        <div className={styles.mainNav}>
          <button
            type="button"
            className={`${styles.mainNavBtn} ${activeSection === "users" ? styles.mainNavBtnActive : ""}`}
            onClick={() => setActiveSection("users")}
          >
            👥 Staff & Volunteer Accounts ({users.length})
          </button>
          <button
            type="button"
            className={`${styles.mainNavBtn} ${activeSection === "properties" ? styles.mainNavBtnActive : ""}`}
            onClick={() => setActiveSection("properties")}
          >
            ⚙️ Project Terminology & Properties
          </button>
        </div>

        {activeSection === "users" ? (
          <>
            <h1 className={styles.h1}>Staff & Volunteer Accounts</h1>

            {/* Create form */}
            <section className={styles.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <h2 className={styles.h2} style={{ margin: 0 }}>Create Account</h2>
                <div className={styles.typeSelectGroup}>
                  <button
                    type="button"
                    className={`${styles.typeSelectBtn} ${userType === "staff" ? styles.typeSelectBtnActive : ""}`}
                    onClick={() => setUserType("staff")}
                  >
                    Staff
                  </button>
                  <button
                    type="button"
                    className={`${styles.typeSelectBtn} ${userType === "volunteer" ? styles.typeSelectBtnActive : ""}`}
                    onClick={() => setUserType("volunteer")}
                  >
                    Volunteer
                  </button>
                </div>
              </div>

              <form className={styles.form} onSubmit={createUser}>
                <div className={styles.row}>
                  <input
                    className={styles.input}
                    placeholder="Full name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                  <input
                    className={styles.input}
                    type="email"
                    placeholder={userType === "staff" ? "name@codingladies.org" : "volunteer@gmail.com (personal email)"}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <div className={styles.inputGroup}>
                    <input
                      className={styles.input}
                      type="text"
                      placeholder="Password (leave blank to auto-generate)"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className={styles.generateBtn}
                      onClick={generatePassword}
                      title="Generate random secure password"
                    >
                      Generate
                    </button>
                  </div>
                </div>
                <div className={styles.row} style={{ alignItems: "center" }}>
                  {photoUrl.trim() ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoUrl.trim()}
                      alt="Avatar preview"
                      className={styles.photoPreview}
                      onError={(e) => { (e.target as HTMLElement).style.display = "none"; }}
                      onLoad={(e) => { (e.target as HTMLElement).style.display = "block"; }}
                    />
                  ) : null}
                  <input
                    className={styles.input}
                    type="url"
                    placeholder="Profile photo URL (optional https://...)"
                    value={photoUrl}
                    onChange={(e) => setPhotoUrl(e.target.value)}
                  />
                  <button className={styles.createBtn} type="submit" disabled={creating}>
                    {creating ? "Creating…" : `Create ${userType === "volunteer" ? "Volunteer" : "Staff"}`}
                  </button>
                </div>
                {createError && <p className={styles.err}>{createError}</p>}
                {createdInfo && (
                  <div className={styles.createdBanner}>
                    <div className={styles.createdHeader}>
                      <span>
                        ✓ {createdInfo.userType === "volunteer" ? "Volunteer" : "Staff"} account created for <strong>{createdInfo.email}</strong>!
                      </span>
                      {createdInfo.emailSent ? (
                        <span style={{ color: "#3fb0c8", fontSize: 12 }}>
                          ✓ Credentials emailed to user
                        </span>
                      ) : null}
                    </div>
                    <div className={styles.tempPassBox}>
                      <code className={styles.tempPassCode}>{createdInfo.password}</code>
                      <button
                        type="button"
                        className={styles.copyButton}
                        onClick={() => {
                          void navigator.clipboard.writeText(createdInfo.password);
                          setCreatedCopied(true);
                          setTimeout(() => setCreatedCopied(false), 2000);
                        }}
                      >
                        {createdCopied ? "Copied!" : "Copy password"}
                      </button>
                    </div>
                  </div>
                )}
              </form>
            </section>

            {/* Users table */}
            <section className={styles.card}>
              {(() => {
                const staffCount = users.filter((u) => u.userType !== "volunteer").length;
                const volunteerCount = users.filter((u) => u.userType === "volunteer").length;
                const filteredUsers =
                  filterTab === "staff"
                    ? users.filter((u) => u.userType !== "volunteer")
                    : filterTab === "volunteer"
                    ? users.filter((u) => u.userType === "volunteer")
                    : users;
                const now = Date.now();

                return (
                  <>
                    <div className={styles.tabsRow}>
                      <h2 className={styles.h2} style={{ margin: 0 }}>
                        {filteredUsers.length} {filteredUsers.length === 1 ? "member" : "members"}
                      </h2>
                      <div className={styles.tabList}>
                        <button
                          type="button"
                          className={`${styles.tabBtn} ${filterTab === "all" ? styles.tabBtnActive : ""}`}
                          onClick={() => setFilterTab("all")}
                        >
                          All ({users.length})
                        </button>
                        <button
                          type="button"
                          className={`${styles.tabBtn} ${filterTab === "staff" ? styles.tabBtnActive : ""}`}
                          onClick={() => setFilterTab("staff")}
                        >
                          Staff ({staffCount})
                        </button>
                        <button
                          type="button"
                          className={`${styles.tabBtn} ${filterTab === "volunteer" ? styles.tabBtnActive : ""}`}
                          onClick={() => setFilterTab("volunteer")}
                        >
                          Volunteers ({volunteerCount})
                        </button>
                      </div>
                    </div>

                    {loading ? (
                      <p className={styles.muted}>Loading…</p>
                    ) : error ? (
                      <p className={styles.err}>{error}</p>
                    ) : (
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Type</th>
                            <th>Email</th>
                            <th>Photo URL</th>
                            <th>Joined</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {filteredUsers.map((u) => {
                            const isOnline = u.lastActiveAt
                              ? now - new Date(u.lastActiveAt).getTime() < 3 * 60 * 1000
                              : false;
                            const isVolunteer = u.userType === "volunteer";

                            return (
                              <tr key={u.id}>
                                <td>
                                  <div className={styles.nameCell}>
                                    {u.photoUrl ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={u.photoUrl}
                                        alt={u.name}
                                        className={styles.avatar}
                                      />
                                    ) : (
                                      <span
                                        className={styles.avatar}
                                        style={{ background: u.color }}
                                      >
                                        {u.name.slice(0, 1).toUpperCase()}
                                      </span>
                                    )}
                                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                      <span
                                        className={isOnline ? styles.onlineIndicator : styles.offlineIndicator}
                                        title={isOnline ? "Online now" : "Offline"}
                                      />
                                      {u.name}
                                    </span>
                                  </div>
                                </td>
                                <td>
                                  <button
                                    type="button"
                                    className={isVolunteer ? styles.badgeVolunteer : styles.badgeStaff}
                                    title="Click to switch role (Staff / Volunteer)"
                                    onClick={() => toggleUserType(u.id, u.userType)}
                                  >
                                    {isVolunteer ? "Volunteer" : "Staff"} ▾
                                  </button>
                                </td>
                                <td className={styles.muted}>{u.email}</td>
                                <td>
                                  <input
                                    className={styles.tablePhotoInput}
                                    key={u.photoUrl ?? "none"}
                                    defaultValue={u.photoUrl ?? ""}
                                    placeholder="Add photo URL…"
                                    title="Edit photo URL (saves on blur)"
                                    onBlur={(e) => {
                                      const val = e.target.value;
                                      if (val !== (u.photoUrl ?? "")) {
                                        void updatePhotoUrl(u.id, val);
                                      }
                                    }}
                                  />
                                </td>
                                <td className={styles.muted}>
                                  {new Date(u.createdAt).toLocaleDateString()}
                                </td>
                                <td className={styles.actions}>
                                  <button
                                    className={styles.resetBtn}
                                    type="button"
                                    onClick={() => {
                                      setResetUser(u);
                                      setCustomPassword("");
                                      setSendEmail(true);
                                      setResetResult(null);
                                      setResetError(null);
                                      setCopied(false);
                                    }}
                                  >
                                    Reset password
                                  </button>
                                  {u.id === currentUserId ? (
                                    <span className={styles.youBadge} title="You cannot delete yourself">
                                      You
                                    </span>
                                  ) : (
                                    <button
                                      className={styles.deleteBtn}
                                      type="button"
                                      onClick={() => deleteUser(u.id, u.name)}
                                    >
                                      Remove
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </>
                );
              })()}
            </section>
          </>
        ) : (
          <section className={styles.card}>
            <div className={styles.templateHeader}>
              <h1 className={styles.h1}>Project Properties & Terminology Manager</h1>
              <p className={styles.templateDesc}>
                Customize property names, options, colors, and views across your organization.
                Update terms (e.g. rename developer terminology to CLA non-profit project terminology) globally or workspace-by-workspace.
                <br />
                <strong style={{ color: "#00BFB3" }}>
                  ✓ Safety Guarantee: All task values, column placements, checklist items, and project structures are 100% preserved.
                </strong>
              </p>
            </div>

            <form onSubmit={handleSyncTemplates}>
              {/* Scope Selector */}
              <div className={styles.scopeBox}>
                <span className={styles.scopeTitle}>Target Scope for Updates</span>
                <div className={styles.scopeRadioGroup}>
                  <label className={styles.scopeLabel}>
                    <input
                      type="radio"
                      name="syncScope"
                      value="global"
                      checked={syncScope === "global"}
                      onChange={() => setSyncScope("global")}
                    />
                    <span>All Projects (Global Organization)</span>
                  </label>
                  {workspacesList.length > 0 && (
                    <label className={styles.scopeLabel}>
                      <input
                        type="radio"
                        name="syncScope"
                        value="workspace"
                        checked={syncScope !== "global"}
                        onChange={() => setSyncScope(workspacesList[0]?.id || "global")}
                      />
                      <span>By Specific Workspace:</span>
                      <select
                        className={styles.workspaceSelect}
                        value={syncScope === "global" ? "" : syncScope}
                        onChange={(e) => setSyncScope(e.target.value)}
                        disabled={syncScope === "global"}
                      >
                        {workspacesList.map((ws) => (
                          <option key={ws.id} value={ws.id}>
                            {ws.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              </div>

              {/* Editable Properties Grid */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <h3 className={styles.h2}>Configured Properties & Columns</h3>
                {templateProps.map((prop, pIdx) => (
                  <div key={pIdx} className={styles.propCard}>
                    <div className={styles.propCardHeader}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <input
                          className={styles.propNameInput}
                          value={prop.name}
                          onChange={(e) => {
                            const val = e.target.value;
                            setTemplateProps((prev) =>
                              prev.map((p, i) => (i === pIdx ? { ...p, name: val } : p)),
                            );
                          }}
                          placeholder="Property Name"
                        />
                        {prop.originalName && prop.name !== prop.originalName && (
                          <span style={{ fontSize: 11, color: "#f59e0b" }}>
                            (Renaming from: {prop.originalName})
                          </span>
                        )}
                      </div>
                      <span className={styles.propTypeBadge}>{prop.type}</span>
                    </div>

                    {prop.options && prop.options.length > 0 && (
                      <div className={styles.optionChipGrid}>
                        {prop.options.map((opt, oIdx) => (
                          <div key={oIdx} className={styles.optionChipItem}>
                            <span
                              className={styles.optionColorDot}
                              style={{ backgroundColor: opt.color }}
                            />
                            <input
                              className={styles.optionNameInput}
                              value={opt.name}
                              onChange={(e) => {
                                const val = e.target.value;
                                setTemplateProps((prev) =>
                                  prev.map((p, i) =>
                                    i === pIdx
                                      ? {
                                          ...p,
                                          options: p.options?.map((o, j) =>
                                            j === oIdx ? { ...o, name: val } : o,
                                          ),
                                        }
                                      : p,
                                  ),
                                );
                              }}
                              placeholder="Option Name"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Views */}
              <div style={{ marginTop: 20 }}>
                <h3 className={styles.h2}>Default Views</h3>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {templateViews.map((view, vIdx) => (
                    <div key={vIdx} className={styles.propCard} style={{ flex: 1, minWidth: 200 }}>
                      <div className={styles.propCardHeader}>
                        <input
                          className={styles.propNameInput}
                          value={view.name}
                          onChange={(e) => {
                            const val = e.target.value;
                            setTemplateViews((prev) =>
                              prev.map((v, i) => (i === vIdx ? { ...v, name: val } : v)),
                            );
                          }}
                          placeholder="View Name"
                        />
                        <span className={styles.propTypeBadge}>{view.kind}</span>
                      </div>
                      <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                        Grouped by: {view.groupBy || "None"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {syncError && <p className={styles.err}>{syncError}</p>}

              {syncResult && (
                <div className={styles.syncSuccessBanner}>
                  <span>✓ {syncResult}</span>
                </div>
              )}

              <div className={styles.syncActionRow}>
                <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                  Updating will rename matching properties, columns, and views across projects in the selected scope without affecting tasks.
                </span>
                <button type="submit" className={styles.syncBtn} disabled={syncing}>
                  {syncing ? "Updating Projects..." : "Sync & Rename in Projects"}
                </button>
              </div>
            </form>
          </section>
        )}
      </div>

      {/* Password Reset Modal */}
      {resetUser && (
        <div className={styles.dialogOverlay} onClick={() => setResetUser(null)}>
          <div className={styles.dialogCard} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.dialogTitle}>Reset Password</h3>
            <p className={styles.dialogSubtitle}>
              Resetting credentials for <strong>{resetUser.name}</strong> ({resetUser.email})
            </p>

            {resetResult ? (
              <>
                <p style={{ margin: 0, fontSize: 13, color: "var(--text-2)" }}>
                  Password has been updated:
                </p>
                <div className={styles.tempPassBox}>
                  <code className={styles.tempPassCode}>{resetResult.password}</code>
                  <button
                    type="button"
                    className={styles.copyButton}
                    onClick={() => {
                      void navigator.clipboard.writeText(resetResult.password);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: 12.5,
                    color: resetResult.emailSent ? "#3fb0c8" : "var(--text-3)",
                  }}
                >
                  {resetResult.emailSent
                    ? `✓ Credentials emailed to ${resetUser.email} via Azure Mailer.`
                    : "Email was not sent. Please share this password with the user directly."}
                </p>
                <div className={styles.dialogActions}>
                  <button
                    className={styles.createBtn}
                    type="button"
                    onClick={() => setResetUser(null)}
                  >
                    Done
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={handleResetPassword} className={styles.form}>
                <div>
                  <label
                    style={{
                      fontSize: 12,
                      color: "var(--text-2)",
                      display: "block",
                      marginBottom: 6,
                    }}
                  >
                    New password (leave blank to auto-generate a secure password)
                  </label>
                  <input
                    className={styles.input}
                    type="text"
                    placeholder="Auto-generate or enter custom (min 8 chars)"
                    value={customPassword}
                    onChange={(e) => setCustomPassword(e.target.value)}
                    style={{ width: "100%" }}
                  />
                </div>

                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={sendEmail}
                    onChange={(e) => setSendEmail(e.target.checked)}
                  />
                  <span>Send credentials to {resetUser.email} via email</span>
                </label>

                {resetError && <p className={styles.err}>{resetError}</p>}

                <div className={styles.dialogActions}>
                  <button
                    type="button"
                    className={styles.cancelBtn}
                    onClick={() => setResetUser(null)}
                    disabled={resetting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={styles.createBtn}
                    disabled={resetting}
                  >
                    {resetting ? "Resetting…" : "Reset password"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
