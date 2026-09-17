"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Form";
import styles from "./AuthForm.module.css";

type Mode = "login" | "register";

export function AuthForm({ mode, signupOpen = true }: { mode: Mode; signupOpen?: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 2FA Challenge state
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");

  const googleBtnRef = useRef<HTMLDivElement>(null);
  const register = mode === "register";

  // Initialize Google Sign-In button if script is loaded
  useEffect(() => {
    if (challengeId) return;

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    function initGoogle() {
      const google = (window as any).google;
      if (!google?.accounts?.id || !googleBtnRef.current) return;

      try {
        google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response: any) => {
            if (!response.credential) return;
            setBusy(true);
            setError(null);
            try {
              const res = await api.post<{ requires2FA?: boolean; challengeId?: string }>("/api/auth/google", {
                credential: response.credential,
              });
              if (res.requires2FA && res.challengeId) {
                setChallengeId(res.challengeId);
                setBusy(false);
                return;
              }
              router.replace("/projects");
              router.refresh();
            } catch (err: any) {
              setError(err instanceof Error ? err.message : "Google sign-in failed.");
              setBusy(false);
            }
          },
        });

        google.accounts.id.renderButton(googleBtnRef.current, {
          theme: "outline",
          size: "large",
          width: 308,
          text: register ? "signup_with" : "signin_with",
          shape: "rectangular",
        });
      } catch (e) {
        console.error("Google button init error:", e);
      }
    }

    if ((window as any).google) {
      initGoogle();
    } else {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = initGoogle;
      document.body.appendChild(script);
    }
  }, [challengeId, register, router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ requires2FA?: boolean; challengeId?: string }>(
        register ? "/api/auth/register" : "/api/auth/login",
        {
          name,
          email,
          password,
        }
      );

      if (res.requires2FA && res.challengeId) {
        setChallengeId(res.challengeId);
        setBusy(false);
        return;
      }

      router.replace("/projects");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  async function submit2FA(event: React.FormEvent) {
    event.preventDefault();
    if (!challengeId || !twoFactorCode.trim()) return;

    setBusy(true);
    setError(null);

    try {
      await api.post("/api/auth/2fa/verify", {
        challengeId,
        code: twoFactorCode.trim(),
      });
      router.replace("/projects");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code. Please try again.");
      setBusy(false);
    }
  }

  // 2FA Verification Screen
  if (challengeId) {
    return (
      <div className={styles.wrap}>
        <div className={styles.card}>
          <Brand />
          <h1 className={styles.h1}>Two-Factor Authentication</h1>
          <p className={styles.tagline}>
            Enter the 6-digit code from your Authenticator app (or an emergency backup code).
          </p>

          <form className={styles.form} onSubmit={submit2FA}>
            <div className={styles.field}>
              <span className="label">Verification Code</span>
              <Input
                size="lg"
                block
                autoFocus
                type="text"
                value={twoFactorCode}
                aria-label="6-digit code"
                onChange={(e) => setTwoFactorCode(e.target.value)}
                placeholder="123456"
                autoComplete="one-time-code"
                required
              />
            </div>

            {error && (
              <div className={styles.error} role="alert">
                {error}
              </div>
            )}

            <Button size="lg" block type="submit" disabled={busy || !twoFactorCode.trim()} className={styles.submit}>
              {busy ? "Verifying…" : "Verify & Sign In"}
            </Button>

            <button
              type="button"
              onClick={() => {
                setChallengeId(null);
                setTwoFactorCode("");
                setError(null);
              }}
              className={styles.cancelLink}
            >
              Back to login
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (register && !signupOpen) {
    return (
      <div className={styles.wrap}>
        <div className={styles.card}>
          <Brand />
          <h1 className={styles.h1}>CLA Flow is invite-only</h1>
          <p className={styles.tagline}>
            This tool is for Coding Ladies Academy staff only.
            <br />
            Contact your admin to get an account.
          </p>
          <div className={styles.switch}>
            Already have an account? <Link href="/login">Sign in</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <Brand />
        <h1 className={styles.h1}>{register ? "Create an account" : "Sign in"}</h1>
        {/* The pitch belongs where somebody is deciding, not where they sign
            in every morning. */}
        {register && (
          <p className={styles.tagline}>
            A small, fast task board. You define the properties; the board follows them.
          </p>
        )}

        <form className={styles.form} onSubmit={submit}>
          {register && (
            <div className={styles.field}>
              <span className="label">Name</span>
              <Input
                size="lg"
                block
                autoFocus
                value={name}
                aria-label="Your name"
                onChange={(e) => setName(e.target.value)}
                placeholder="Ada Lovelace"
                autoComplete="name"
                required
              />
            </div>
          )}
          <div className={styles.field}>
            <span className="label">Email</span>
            <Input
              size="lg"
              block
              autoFocus={!register}
              type="email"
              value={email}
              aria-label="Your email"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>
          <div className={styles.field}>
            <span className="label">Password</span>
            <div className={styles.passwordRow}>
              <Input
                size="lg"
                block
                type={show ? "text" : "password"}
                value={password}
                aria-label="Your password"
                minLength={register ? 8 : undefined}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={register ? "At least 8 characters" : "Your password"}
                autoComplete={register ? "new-password" : "current-password"}
                required
              />
              {/*
               * A reveal rather than a second field. There is no password
               * reset, so a typo here locks the account for good.
               */}
              <button
                type="button"
                className={styles.reveal}
                aria-pressed={show}
                aria-label={show ? "Hide the password" : "Show the password"}
                onClick={() => setShow((v) => !v)}
              >
                {show ? "Hide" : "Show"}
              </button>
            </div>
            {register && (
              <span className={styles.hint}>
                At least 8 characters. There is no password reset yet — keep it somewhere safe.
              </span>
            )}
          </div>

          {error && (
            <div className={styles.error} role="alert">
              {error}
            </div>
          )}

          <Button size="lg" block type="submit" disabled={busy} className={styles.submit}>
            {busy ? "One moment…" : register ? "Create account" : "Sign in"}
          </Button>
        </form>

        {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && (
          <div className={styles.googleSection}>
            <div className={styles.divider}>
              <span>or</span>
            </div>
            <div ref={googleBtnRef} className={styles.googleBtnContainer} />
          </div>
        )}

        <div className={styles.switch}>
          {register ? (
            <>
              Already have an account? <Link href="/login">Sign in</Link>
            </>
          ) : (
            <>
              New here? <Link href="/register">Create an account</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div className={styles.brand}>
      <img src="https://codingladies.org/favicon.ico" alt="CLA Flow" className={styles.mark} style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'contain' }} />
      <div className={styles.name}>CLA Flow</div>
    </div>
  );
}
