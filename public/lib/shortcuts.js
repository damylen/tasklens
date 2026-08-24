const VIEW_SHORTCUTS = new Map([
  ["t", "timeline"],
  ["k", "kanban"],
  ["g", "groups"],
  ["f", "files"],
  ["u", "changes"],
]);

/** Resolve a single unmodified key without touching browser state. */
export function resolveShortcut(key, backlogs) {
  const normalized = String(key || "").toLowerCase();
  if (normalized === "/") return { type: "search", key: "/" };
  if (normalized === "a") return { type: "active", key: "A" };
  if (normalized === "o") return { type: "overview", key: "O" };
  if (normalized === "d") return { type: "toggleDone", key: "D" };
  if (VIEW_SHORTCUTS.has(normalized)) {
    return { type: "view", id: VIEW_SHORTCUTS.get(normalized), key: normalized.toUpperCase() };
  }
  if (/^[1-9]$/.test(normalized)) {
    const backlog = backlogs[Number(normalized) - 1];
    if (backlog) return { type: "project", backlog, key: normalized };
  }
  return null;
}

/** Keyboard navigation must never steal letters from a field being edited. */
export function isTypingTarget(target) {
  if (!target || typeof target.closest !== "function") return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}
