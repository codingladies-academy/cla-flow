import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign up · CLA Flow" };

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/projects");
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--bg)",
        fontFamily: "var(--font-sans)",
      }}
    >
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--line)",
          borderRadius: 10,
          padding: "32px 28px",
          maxWidth: 360,
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
          textAlign: "center",
        }}
      >
        <img
          src="https://codingladies.org/favicon.ico"
          alt="CLA Flow"
          style={{ width: 40, height: 40, borderRadius: 8 }}
        />
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "var(--text-1)" }}>
          CLA Flow is invite-only
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-3)", lineHeight: 1.6 }}>
          This tool is for Coding Ladies Academy staff only.
          <br />
          Contact your admin to get an account.
        </p>
        <a
          href="/login"
          style={{
            marginTop: 4,
            fontSize: 13,
            color: "var(--accent)",
            textDecoration: "none",
          }}
        >
          Already have an account? Sign in
        </a>
      </div>
    </div>
  );
}
