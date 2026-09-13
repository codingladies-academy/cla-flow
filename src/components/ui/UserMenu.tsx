"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client";
import { useTheme } from "@/lib/theme";
import { Avatar } from "./Avatar";
import { useDismiss } from "./useDismiss";
import { MoonIcon, SunIcon } from "./Icons";
import styles from "./UserMenu.module.css";

export type SessionUser = { id: string; name: string; email: string; color: string; photoUrl?: string | null };

export function UserMenu({
  user,
  extra,
  compact = false,
  placement = "bottom-right",
}: {
  user: SessionUser;
  extra?: React.ReactNode;
  compact?: boolean;
  placement?: "bottom-right" | "top-right";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(() => setOpen(false), open);
  const { theme, toggle: toggleTheme } = useTheme();

  async function signOut() {
    await api.post("/api/auth/logout");
    router.replace("/login");
    router.refresh();
  }

  const menuClass = `${styles.menu} ${placement === "top-right" ? styles.menuTopRight : ""}`;

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        className={compact ? styles.buttonCompact : styles.button}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title={compact ? user.name : undefined}
      >
        <Avatar name={user.name} color={user.color} size={compact ? 34 : 20} photoUrl={user.photoUrl} />
        {!compact && (
          <>
            <span className={styles.name}>{user.name}</span>
            <span className={styles.caret}>▾</span>
          </>
        )}
      </button>
      {open && (
        <div className={menuClass} role="menu">
          <div className={styles.email}>
            <div style={{ fontWeight: 600, color: "var(--text, #fff)" }}>{user.name}</div>
            <div>{user.email}</div>
          </div>
          {extra}
          <Link
            className={styles.item}
            role="menuitem"
            href="/account"
            onClick={() => setOpen(false)}
          >
            Account
          </Link>
          <Link
            className={styles.item}
            role="menuitem"
            href="/projects"
            onClick={() => setOpen(false)}
          >
            All projects
          </Link>
          <button
            className={styles.item}
            role="menuitem"
            onClick={() => {
              toggleTheme();
            }}
          >
            <span style={{ width: 16, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              {theme === "dark" ? <SunIcon size={14} /> : <MoonIcon size={14} />}
            </span>
            <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
          </button>
          <div className={styles.rule} />
          <button className={styles.item} role="menuitem" onClick={signOut}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
