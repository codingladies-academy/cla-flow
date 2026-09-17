"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { Button } from "@/components/ui/Button";
import styles from "./AiTaskActions.module.css";

export function AiTaskActions({
  taskId,
  onReload,
  currentDescription,
  onUpdateDescription,
}: {
  taskId: string;
  onReload?: () => Promise<void>;
  currentDescription?: string;
  onUpdateDescription?: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<{ action: string; content: string } | null>(null);
  const [applying, setApplying] = useState(false);
  const [appliedMessage, setAppliedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function triggerAi(action: "summarize" | "subtasks" | "acceptance_criteria") {
    setLoadingAction(action);
    setError(null);
    setAppliedMessage(null);
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

  async function addChecklistToTask() {
    if (!aiResult || aiResult.action !== "subtasks") return;
    setApplying(true);
    setError(null);
    try {
      const lines = aiResult.content
        .split("\n")
        .map((l) => l.replace(/^[-*]\s*(\[[ xX]\]\s*)?/, "").replace(/^\d+\.\s*/, "").trim())
        .filter((l) => l.length > 0);

      if (lines.length === 0) {
        setError("No items found to add.");
        return;
      }

      for (const itemText of lines) {
        await api.post(`/api/tasks/${taskId}/checklist`, { text: itemText });
      }

      if (onReload) {
        await onReload();
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("ushabti:remote-change"));
      }

      setAppliedMessage(`✓ Added ${lines.length} items to checklist!`);
      setTimeout(() => {
        setOpen(false);
        setAiResult(null);
        setAppliedMessage(null);
      }, 1200);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Failed to add checklist items.");
    } finally {
      setApplying(false);
    }
  }

  async function appendToDescription() {
    if (!aiResult || !onUpdateDescription) return;
    setApplying(true);
    try {
      const addition = `\n\n### ${
        aiResult.action === "acceptance_criteria" ? "Acceptance Criteria" : "Summary"
      }\n${aiResult.content}`;

      const updated = currentDescription ? `${currentDescription.trim()}${addition}` : aiResult.content;
      onUpdateDescription(updated);
      setAppliedMessage("✓ Added to description!");
      setTimeout(() => {
        setOpen(false);
        setAiResult(null);
        setAppliedMessage(null);
      }, 1200);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Failed to update description.");
    } finally {
      setApplying(false);
    }
  }

  async function postAsComment() {
    if (!aiResult) return;
    setApplying(true);
    try {
      await api.post(`/api/tasks/${taskId}/comments`, {
        body: `🤖 **Gemini AI Summary:**\n\n${aiResult.content}`,
      });
      if (onReload) {
        await onReload();
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("ushabti:remote-change"));
      }
      setAppliedMessage("✓ Posted as comment!");
      setTimeout(() => {
        setOpen(false);
        setAiResult(null);
        setAppliedMessage(null);
      }, 1200);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Failed to post comment.");
    } finally {
      setApplying(false);
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
                setAppliedMessage(null);
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
          {appliedMessage && <div className={styles.successMsg}>{appliedMessage}</div>}

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
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    type="button"
                    className={styles.copyBtn}
                    onClick={() => navigator.clipboard.writeText(aiResult.content)}
                    title="Copy to clipboard"
                  >
                    Copy
                  </button>
                </div>
              </div>

              <div className={styles.resultContent}>{aiResult.content}</div>

              {/* Action Buttons to apply directly to the task */}
              <div className={styles.applyBar}>
                {aiResult.action === "subtasks" && (
                  <Button
                    onClick={addChecklistToTask}
                    disabled={applying}
                    className={styles.applyBtn}
                  >
                    {applying ? "Adding items…" : "➕ Add to Task Checklist"}
                  </Button>
                )}

                {aiResult.action === "acceptance_criteria" && onUpdateDescription && (
                  <Button
                    onClick={appendToDescription}
                    disabled={applying}
                    className={styles.applyBtn}
                  >
                    {applying ? "Updating…" : "➕ Append to Description"}
                  </Button>
                )}

                {aiResult.action === "summarize" && (
                  <Button
                    onClick={postAsComment}
                    disabled={applying}
                    className={styles.applyBtn}
                  >
                    {applying ? "Posting…" : "💬 Post as Comment"}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
