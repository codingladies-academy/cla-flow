"use client";

import { initials } from "@/lib/colors";

export function Avatar({
  name,
  color,
  size = 18,
  title,
  kind = "human",
  live = false,
  photoUrl,
}: {
  name: string;
  color: string;
  size?: number;
  title?: string;
  kind?: "human" | "agent";
  /** An agent with an open run breathes, so the board shows who is at work. */
  live?: boolean;
  photoUrl?: string | null;
}) {
  const face =
    photoUrl && kind === "human" ? (
      <span
        title={title ?? name}
        style={{
          width: size,
          height: size,
          flex: `0 0 ${size}px`,
          borderRadius: "50%",
          overflow: "hidden",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoUrl}
          alt={name}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          onError={(e) => {
            // Fall back to initials circle if the image fails to load
            (e.currentTarget.parentElement as HTMLElement).style.background = color;
            e.currentTarget.style.display = "none";
          }}
        />
      </span>
    ) : (
      <span
        title={title ?? name}
        style={{
          width: size,
          height: size,
          flex: `0 0 ${size}px`,
          borderRadius: "50%",
          background: color,
          color: kind === "agent" ? "#05242b" : "#fff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-mono)",
          fontWeight: 500,
          fontSize: Math.max(7.5, size * (kind === "agent" ? 0.5 : 0.44)),
          letterSpacing: "0.02em",
          userSelect: "none",
          position: "relative",
        }}
      >
        {kind === "agent" ? "◆" : initials(name)}
      </span>
    );

  if (!live) return face;

  return (
    <span
      style={{
        position: "relative",
        width: size,
        height: size,
        flex: `0 0 ${size}px`,
        display: "inline-flex",
      }}
      data-testid="agent-live-ring"
    >
      <span
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          border: `1px solid ${color}`,
          animation: "ushabti-ring 1.8s ease-out infinite",
          pointerEvents: "none",
        }}
      />
      {face}
    </span>
  );
}
