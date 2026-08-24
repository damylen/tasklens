export const PRIORITIES = ["critical", "high", "medium", "low"];

export function normalizePriorities(value) {
  const values = Array.isArray(value) ? value : typeof value === "string" && value !== "all" ? [value] : [];
  return PRIORITIES.filter((priority) => values.includes(priority));
}

export function togglePriority(selected, priority) {
  if (priority === "all") return [];
  const current = normalizePriorities(selected);
  return current.includes(priority)
    ? current.filter((value) => value !== priority)
    : PRIORITIES.filter((value) => current.includes(value) || value === priority);
}

export function priorityMatches(priority, selected) {
  const current = normalizePriorities(selected);
  return current.length === 0 || current.includes(priority);
}
