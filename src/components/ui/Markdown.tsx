"use client";

import DOMPurify from "dompurify";
import { marked } from "marked";
import { useEffect, useMemo, useState } from "react";
import styles from "./Markdown.module.css";

marked.setOptions({ gfm: true, breaks: true });

export function Markdown({ text, className }: { text: string; className?: string }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const html = useMemo(() => {
    if (!mounted || !text) return null;
    const raw = marked.parse(text, { async: false }) as string;
    const sanitized = DOMPurify.sanitize(raw, {
      USE_PROFILES: { html: true },
      ADD_ATTR: ["target"],
    });

    // Ensure external links open in new tab
    return sanitized.replace(/<a\s+href=/gi, '<a target="_blank" rel="noopener noreferrer" href=');
  }, [mounted, text]);

  if (html === null) {
    return (
      <div className={`${styles.markdown} ${className || ""}`} style={{ whiteSpace: "pre-wrap" }}>
        {text}
      </div>
    );
  }

  return (
    <div
      className={`${styles.markdown} ${className || ""}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
