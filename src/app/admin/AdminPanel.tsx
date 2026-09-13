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

  // Create form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

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

  useEffect(() => {
    void load();
  }, [load]);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    setCreateSuccess(null);
    try {
      await api.post("/api/admin/users", {
        name,
        email,
        password,
        photoUrl: photoUrl.trim() || undefined,
      });
      setCreateSuccess(`Account created for ${email}`);
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
        <h1 className={styles.h1}>Staff accounts</h1>

        {/* Create form */}
        <section className={styles.card}>
          <h2 className={styles.h2}>Create account</h2>
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
                placeholder="name@codingladies.org"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <input
                className={styles.input}
                type="password"
                placeholder="Temporary password (min 8 chars)"
                value={password}
                minLength={8}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
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
                {creating ? "Creating…" : "Create"}
              </button>
            </div>
            {createError && <p className={styles.err}>{createError}</p>}
            {createSuccess && <p className={styles.ok}>{createSuccess}</p>}
          </form>
        </section>

        {/* Users table */}
        <section className={styles.card}>
          <h2 className={styles.h2}>{users.length} {users.length === 1 ? "member" : "members"}</h2>
          {loading ? (
            <p className={styles.muted}>Loading…</p>
          ) : error ? (
            <p className={styles.err}>{error}</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Photo URL</th>
                  <th>Joined</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
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
                        {u.name}
                      </div>
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
                ))}
              </tbody>
            </table>
          )}
        </section>
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
