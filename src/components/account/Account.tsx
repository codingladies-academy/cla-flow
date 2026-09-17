"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { Button } from "@/components/ui/Button";
import { ColorSwatches, Field, Input } from "@/components/ui/Form";
import { Card, Note, Row, Section, Spacer } from "@/components/ui/Layout";
import { Toasts, type Toast } from "@/components/ui/Toasts";
import { UserMenu, type SessionUser } from "@/components/ui/UserMenu";
import { useTheme } from "@/lib/theme";
import { subscribeToPushNotifications } from "@/lib/push-client";
import styles from "./account.module.css";

export function Account({ user, version, isAdmin }: { user: SessionUser; version: string; isAdmin: boolean }) {
  const router = useRouter();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const notify = useCallback((text: string, kind: Toast["kind"] = "error") => {
    const id = (seq.current += 1);
    setToasts((list) => [...list, { id, text, kind }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 5200);
  }, []);

  const [name, setName] = useState(user.name);
  const [color, setColor] = useState(user.color);
  const [photoUrl, setPhotoUrl] = useState(user.photoUrl ?? "");
  const { theme, setTheme } = useTheme();

  async function saveProfile(patch: { name?: string; color?: string; photoUrl?: string | null }) {
    try {
      await api.patch("/api/auth/me", patch);
      router.refresh();
      notify("Saved.", "info");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not save.");
      setName(user.name);
      setColor(user.color);
      setPhotoUrl(user.photoUrl ?? "");
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.bar}>
        <img src="https://codingladies.org/favicon.ico" alt="CLA Flow" className={styles.mark} style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'contain' }} />
        <Link href="/projects" className={styles.brand}>
          CLA Flow
        </Link>
        <span style={{ flex: 1 }} />
        {isAdmin && (
          <Link href="/admin" style={{ fontSize: 12, color: 'var(--text-3)', marginRight: 8 }}>Admin</Link>
        )}
        <UserMenu user={{ ...user, name, color, photoUrl: photoUrl || null }} />
      </div>

      <div className={styles.body}>
        <h1 className={styles.h1}>Account</h1>

        <Card>
          <Row className={styles.stack}>
            <Field label="Name" note="Cards, comments and the activity log use this.">
              <Input
                size="lg"
                block
                aria-label="Your name"
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => {
                  const trimmed = name.trim();
                  if (!trimmed) return setName(user.name);
                  if (trimmed !== user.name) void saveProfile({ name: trimmed });
                }}
              />
            </Field>
          </Row>

          <Row className={styles.stack}>
            <Field
              label="Colour"
              note="Your circle on every card. Pick one nobody else on your team is using."
            >
              <ColorSwatches
                name={name || user.name}
                value={color}
                onPick={(next) => {
                  setColor(next);
                  if (next !== user.color) void saveProfile({ color: next });
                }}
              />
            </Field>
          </Row>

          <Row className={styles.stack}>
            <Field
              label="Profile photo"
              note="A public HTTPS image URL. Leave blank to use your initials."
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoUrl}
                    alt="Preview"
                    style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                  />
                )}
                <Input
                  size="lg"
                  block
                  aria-label="Profile photo URL"
                  placeholder="https://example.com/photo.jpg"
                  value={photoUrl}
                  onChange={(e) => setPhotoUrl(e.target.value)}
                  onBlur={() => {
                    const trimmed = photoUrl.trim();
                    const saved = user.photoUrl ?? "";
                    if (trimmed !== saved) {
                      void saveProfile({ photoUrl: trimmed || null });
                    }
                  }}
                />
              </div>
            </Field>
          </Row>

          <Row className={styles.stack}>
            <Field label="Email" note="You sign in with this. It cannot be changed yet.">
              <span className={styles.readonly}>{user.email}</span>
            </Field>
          </Row>
        </Card>

        <Card>
          <Row className={styles.stack}>
            <Field label="Theme" note="Choose your preferred appearance for CLA Flow.">
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <Button
                  variant={theme === "dark" ? "primary" : "ghost"}
                  onClick={() => setTheme("dark")}
                >
                  <span style={{ marginRight: 6 }}>🌙</span> Dark
                </Button>
                <Button
                  variant={theme === "light" ? "primary" : "ghost"}
                  onClick={() => setTheme("light")}
                >
                  <span style={{ marginRight: 6 }}>☀️</span> Light
                </Button>
              </div>
            </Field>
          </Row>
        </Card>

        <NotificationsCalendarSection notify={notify} userEmail={user.email} />

        <TwoFactorSection notify={notify} />

        <PasswordSection notify={notify} />

        <span className={styles.version}>CLA Flow {version}</span>
      </div>

      <Toasts toasts={toasts} />
    </div>
  );
}

/**
 * There is no password reset, so this is the only way back from one you think
 * has leaked. Changing it ends every other session.
 */
function PasswordSection({ notify }: { notify: (text: string, kind?: Toast["kind"]) => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [others, setOthers] = useState<number | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      const res = await api.get<{ others: number }>("/api/auth/sessions");
      setOthers(res.others);
    } catch {
      setOthers(null);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void api
      .get<{ others: number }>("/api/auth/sessions")
      .then((res) => alive && setOthers(res.others))
      .catch(() => alive && setOthers(null));
    return () => {
      alive = false;
    };
  }, []);

  async function change() {
    if (busy) return;
    setError(null);
    if (next.length < 8) return setError("The new password must have at least 8 characters.");
    setBusy(true);
    try {
      await api.post("/api/auth/password", { current, next });
      setCurrent("");
      setNext("");
      notify("Password changed. Every other session is signed out.", "info");
      await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the password.");
    } finally {
      setBusy(false);
    }
  }

  async function signOutOthers() {
    try {
      await api.del("/api/auth/sessions");
      notify("Signed out everywhere else.", "info");
      await loadSessions();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not sign the other sessions out.");
    }
  }

  return (
    <Section title="Password">
      <Card>
        <Row className={styles.stack}>
          <Field label="Now">
            <Input
              size="lg"
              block
              type={show ? "text" : "password"}
              autoComplete="current-password"
              aria-label="The password you use now"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </Field>
        </Row>
        <Row className={styles.stack}>
          <Field
            label="New"
            error={error}
            note="At least 8 characters. There is no password reset — keep it somewhere safe."
          >
            <Input
              size="lg"
              block
              type={show ? "text" : "password"}
              autoComplete="new-password"
              aria-label="The password you want"
              minLength={8}
              invalid={error !== null}
              value={next}
              onChange={(e) => {
                setNext(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && void change()}
            />
          </Field>
        </Row>
        <Row>
          <button
            type="button"
            className={styles.reveal}
            aria-pressed={show}
            onClick={() => setShow((v) => !v)}
          >
            {show ? "Hide" : "Show"} the passwords
          </button>
          <Spacer />
          <Button onClick={() => void change()} disabled={busy || !current || !next}>
            {busy ? "Changing…" : "Change password"}
          </Button>
        </Row>
        <Row>
          <Note>
            {others === null
              ? "Other sessions could not be counted."
              : others === 0
                ? "No other session is signed in."
                : `${others} other ${others === 1 ? "session is" : "sessions are"} signed in.`}
          </Note>
          <Spacer />
          <Button variant="ghost" disabled={!others} onClick={() => void signOutOthers()}>
            Sign out everywhere
          </Button>
        </Row>
      </Card>
    </Section>
  );
}

function NotificationsCalendarSection({
  notify,
  userEmail,
}: {
  notify: (text: string, kind?: Toast["kind"]) => void;
  userEmail: string;
}) {
  const [pushStatus, setPushStatus] = useState<"default" | "granted" | "denied" | "unsupported">("default");
  const [copiedCalendar, setCopiedCalendar] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPushStatus(Notification.permission);
    } else {
      setPushStatus("unsupported");
    }
  }, []);

  async function enablePush() {
    try {
      const ok = await subscribeToPushNotifications();
      if (ok) {
        setPushStatus("granted");
        notify("Push notifications enabled!", "info");
      } else {
        notify("Could not enable push notifications. Check browser permissions.");
      }
    } catch {
      notify("Failed to enable push notifications.");
    }
  }

  const calendarFeedUrl = typeof window !== "undefined" ? `${window.location.origin}/api/calendar/my-tasks` : "";

  function copyFeedUrl() {
    if (!calendarFeedUrl) return;
    navigator.clipboard.writeText(calendarFeedUrl);
    setCopiedCalendar(true);
    notify("Calendar feed URL copied to clipboard.", "info");
    setTimeout(() => setCopiedCalendar(false), 2000);
  }

  return (
    <Section title="Notifications & Calendar">
      <Card>
        <Row className={styles.stack}>
          <Field
            label="Push Notifications"
            note="Receive instant notifications for assignments, comments, and task mentions."
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
              {pushStatus === "granted" ? (
                <span style={{ fontSize: 13, color: "var(--accent-ink, #059669)", fontWeight: 500 }}>
                  ✓ Push notifications active
                </span>
              ) : pushStatus === "denied" ? (
                <span style={{ fontSize: 13, color: "var(--color-danger, #ef4444)" }}>
                  Blocked in browser settings
                </span>
              ) : (
                <Button onClick={enablePush}>Enable Push Notifications</Button>
              )}
            </div>
          </Field>
        </Row>

        <Row className={styles.stack}>
          <Field
            label="Google Calendar Feed"
            note="Subscribe in Google Calendar, Apple Calendar, or Outlook to sync your task due dates."
          >
            <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center" }}>
              <Input
                size="lg"
                block
                readOnly
                value={calendarFeedUrl}
                aria-label="Calendar Feed URL"
              />
              <Button onClick={copyFeedUrl} variant="ghost" style={{ flexShrink: 0 }}>
                {copiedCalendar ? "Copied!" : "Copy Feed URL"}
              </Button>
            </div>
          </Field>
        </Row>
      </Card>
    </Section>
  );
}

function TwoFactorSection({ notify }: { notify: (text: string, kind?: Toast["kind"]) => void }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [setupData, setSetupData] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  useEffect(() => {
    void api
      .get<{ enabled: boolean }>("/api/auth/2fa/setup")
      .then((res) => setEnabled(res.enabled))
      .catch(() => setEnabled(false));
  }, []);

  async function startSetup() {
    setBusy(true);
    try {
      const res = await api.get<{ enabled: boolean; secret: string; uri: string }>("/api/auth/2fa/setup");
      if (res.enabled) {
        setEnabled(true);
      } else {
        setSetupData({ secret: res.secret, uri: res.uri });
      }
    } catch {
      notify("Failed to initiate 2FA setup.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup() {
    if (!setupData || !code.trim()) return;
    setBusy(true);
    try {
      const res = await api.post<{ success: boolean; backupCodes: string[] }>("/api/auth/2fa/setup", {
        secret: setupData.secret,
        code: code.trim(),
      });
      setEnabled(true);
      setBackupCodes(res.backupCodes);
      setSetupData(null);
      setCode("");
      notify("Two-factor authentication enabled successfully!", "info");
    } catch (err: any) {
      notify(err instanceof Error ? err.message : "Invalid code. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function disable2FA() {
    if (!confirm("Are you sure you want to disable two-factor authentication?")) return;
    setBusy(true);
    try {
      await api.del("/api/auth/2fa/setup");
      setEnabled(false);
      setBackupCodes(null);
      notify("Two-factor authentication disabled.", "info");
    } catch {
      notify("Failed to disable 2FA.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Two-Factor Authentication (2FA)">
      <Card>
        {enabled === null ? (
          <Note>Checking 2FA status…</Note>
        ) : enabled ? (
          <>
            <Row className={styles.stack}>
              <Field
                label="Status"
                note="Your account is protected with Google Authenticator / TOTP two-factor security."
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 13, color: "var(--accent-ink, #059669)", fontWeight: 600 }}>
                    🛡️ Two-Factor Authentication is Active
                  </span>
                </div>
              </Field>
            </Row>

            {backupCodes && backupCodes.length > 0 && (
              <Row className={styles.stack}>
                <Field
                  label="Emergency Backup Codes"
                  note="Save these single-use codes safely. If you lose your Authenticator app, each code can be used once to sign in."
                >
                  <div
                    style={{
                      background: "var(--bg-card, #f8fafc)",
                      padding: "12px 16px",
                      borderRadius: 8,
                      fontFamily: "var(--font-mono, monospace)",
                      fontSize: 13,
                      display: "grid",
                      gridTemplateColumns: "repeat(2, 1fr)",
                      gap: "6px 16px",
                      marginTop: 4,
                    }}
                  >
                    {backupCodes.map((c, i) => (
                      <div key={i}>{c}</div>
                    ))}
                  </div>
                </Field>
              </Row>
            )}

            <Row>
              <Spacer />
              <Button variant="ghost" onClick={disable2FA} disabled={busy}>
                Disable 2FA
              </Button>
            </Row>
          </>
        ) : setupData ? (
          <>
            <Row className={styles.stack}>
              <Field
                label="1. Scan QR Code in Authenticator App"
                note="Open Google Authenticator, Authy, or Apple Passwords and scan this QR code or enter the key manually."
              >
                <div style={{ display: "flex", gap: 20, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(setupData.uri)}`}
                    alt="2FA QR Code"
                    style={{ width: 140, height: 140, borderRadius: 8, border: "1px solid var(--line)" }}
                  />
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 200 }}>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>Manual Entry Key:</span>
                    <code
                      style={{
                        padding: "6px 10px",
                        background: "var(--bg-top)",
                        border: "1px solid var(--line)",
                        borderRadius: 6,
                        fontSize: 13,
                        wordBreak: "break-all",
                      }}
                    >
                      {setupData.secret}
                    </code>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        navigator.clipboard.writeText(setupData.secret);
                        setCopiedSecret(true);
                        setTimeout(() => setCopiedSecret(false), 2000);
                      }}
                    >
                      {copiedSecret ? "Copied!" : "Copy Secret Key"}
                    </Button>
                  </div>
                </div>
              </Field>
            </Row>

            <Row className={styles.stack}>
              <Field
                label="2. Enter 6-digit Code from App"
                note="Type the current 6-digit code displayed in your Authenticator app to confirm."
              >
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <Input
                    size="lg"
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="123456"
                    maxLength={6}
                    autoFocus
                  />
                  <Button onClick={confirmSetup} disabled={busy || code.trim().length !== 6}>
                    {busy ? "Verifying…" : "Confirm & Enable"}
                  </Button>
                </div>
              </Field>
            </Row>

            <Row>
              <Button variant="ghost" onClick={() => setSetupData(null)}>
                Cancel
              </Button>
            </Row>
          </>
        ) : (
          <Row>
            <Note>Add an extra layer of security to your CLA Flow account using an Authenticator app.</Note>
            <Spacer />
            <Button onClick={startSetup} disabled={busy}>
              Set up 2FA
            </Button>
          </Row>
        )}
      </Card>
    </Section>
  );
}
