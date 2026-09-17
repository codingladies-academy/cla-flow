import type { PropertyType, ViewKind } from "./types";

export type DefaultOption = { name: string; color: string };
export type DefaultProperty = {
  name: string;
  type: PropertyType;
  options?: DefaultOption[];
};

/**
 * A new project starts with the property set of the design. Nothing here is
 * hardcoded in the app: every row becomes an ordinary editable property, and
 * the user can rename, re-colour or delete any of it.
 */
export const DEFAULT_PROPERTIES: DefaultProperty[] = [
  {
    name: "Status",
    type: "select",
    options: [
      { name: "Backlog", color: "#6b7280" },
      { name: "To Do", color: "#9aa0aa" },
      { name: "In Progress", color: "#d1913a" },
      { name: "Review", color: "#3fb0c8" },
      { name: "Done", color: "#4f8a5b" },
    ],
  },
  {
    name: "Priority",
    type: "select",
    options: [
      { name: "Urgent", color: "#e0574d" },
      { name: "High", color: "#d1913a" },
      { name: "Medium", color: "#4b8fbe" },
      { name: "Low", color: "#8b8f98" },
    ],
  },
  { name: "Assignee", type: "person" },
  {
    name: "Stage",
    type: "select",
    options: [
      { name: "Planning", color: "#8b8f98" },
      { name: "Execution", color: "#3fb0c8" },
      { name: "Monitoring", color: "#6d5bd0" },
      { name: "Review", color: "#d1913a" },
      { name: "Completed", color: "#4f8a5b" },
    ],
  },
  {
    name: "Scope",
    type: "select",
    options: [
      { name: "Small", color: "#8b8f98" },
      { name: "Medium", color: "#4b8fbe" },
      { name: "Large", color: "#d1913a" },
    ],
  },
  {
    name: "Category",
    type: "multi_select",
    options: [
      { name: "Operations", color: "#2f9e7a" },
      { name: "Logistics", color: "#4b8fbe" },
      { name: "Training", color: "#6d5bd0" },
      { name: "Communications", color: "#c2557a" },
      { name: "Finance", color: "#d1913a" },
      { name: "General", color: "#7a8a2f" },
    ],
  },
  { name: "Due Date", type: "date" },
];

/**
 * Views that a new project starts with. `groupBy` names a default property; a
 * list groups nothing, so it names none.
 */
export const DEFAULT_VIEWS: {
  name: string;
  kind: ViewKind;
  groupBy: string | null;
  isDefault: boolean;
}[] = [
  { name: "Task Board", kind: "board", groupBy: "Status", isDefault: true },
  { name: "Stages", kind: "board", groupBy: "Stage", isDefault: false },
];

export function suggestProjectKey(name: string): string {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "TSK";
  if (words.length === 1) return words[0].slice(0, 3).padEnd(2, "X");
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join("");
}
