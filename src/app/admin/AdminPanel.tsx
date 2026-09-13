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

export function AdminPanel({ adminName }: { adminName: string }) {
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

  async function deleteUser(userId: string, userName: string) {
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
                    <td>
                      <button
                        className={styles.deleteBtn}
                        onClick={() => deleteUser(u.id, u.name)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
