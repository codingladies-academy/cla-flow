"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { Button } from "@/components/ui/Button";
import styles from "./AiTaskActions.module.css";

export function AiTaskActions({
  taskId,
  onInsertSubtasks,
  onInsertDescription,
}: {
  taskId: string;
  onInsertSubtasks?: (subtasksMarkdown: string) => void;
  onInsertDescription?: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<{ action: string; content: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function triggerAi(action: "summarize" | "subtasks" | "acceptance_criteria") {
    setLoadingAction(action);
    setError(null);
    try {
      const res = await api.post<{ result?: string; error?: string }>("/api/ai/task-assist", {
        taskId,
        action,
      });

      if (res.result) {
        setAiResult({ action, content: res.result });
      }
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "AI action failed.");
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={`${styles.sparkleBtn} ${open ? styles.active : ""}`}
        onClick={() => setOpen((v) => !v)}
        title="Gemini AI Assistant"
      >
        <span className={styles.sparkleIcon}>✨</span>
        <span className={styles.label}>Gemini AI</span>
      </button>

      {open && (
        <div className={styles.panel}>
          <div className={styles.header}>
            <div className={styles.title}>
              <span>✨</span> Gemini Task Assistant
            </div>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={() => {
                setOpen(false);
                setAiResult(null);
                setError(null);
              }}
            >
              ✕
            </button>
          </div>

          <div className={styles.actions}>
            <Button
              variant="ghost"
              disabled={loadingAction !== null}
              onClick={() => triggerAi("summarize")}
              className={styles.actionBtn}
            >
              {loadingAction === "summarize" ? "Summarizing…" : "📝 Summarize Discussion"}
            </Button>
            <Button
              variant="ghost"
              disabled={loadingAction !== null}
              onClick={() => triggerAi("subtasks")}
              className={styles.actionBtn}
            >
              {loadingAction === "subtasks" ? "Generating…" : "☑️ Generate Checklist"}
            </Button>
            <Button
              variant="ghost"
              disabled={loadingAction !== null}
              onClick={() => triggerAi("acceptance_criteria")}
              className={styles.actionBtn}
            >
              {loadingAction === "acceptance_criteria" ? "Creating…" : "🎯 Acceptance Criteria"}
            </Button>
          </div>

          {error && <div className={styles.error}>{error}</div>}

          {aiResult && (
            <div className={styles.resultBox}>
              <div className={styles.resultHeader}>
                <span className={styles.resultTitle}>
                  {aiResult.action === "summarize"
                    ? "Summary"
                    : aiResult.action === "subtasks"
                      ? "Generated Checklist"
                      : "Acceptance Criteria"}
                </span>
                <button
                  type="button"
                  className={styles.copyBtn}
                  onClick={() => navigator.clipboard.writeText(aiResult.content)}
                  title="Copy to clipboard"
                >
                  Copy
                </button>
              </div>
              <div className={styles.resultContent}>{aiResult.content}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
