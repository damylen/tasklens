import { createStore } from "./persist.js";

const stateStores = new Map();

/** One state store per project, shared by Home and the full Timeline view. */
export function timelineStateStore(root, preferred = null) {
  const key = root || "";
  if (!stateStores.has(key)) stateStores.set(key, preferred || createStore(key));
  return stateStores.get(key);
}

/** Preserve stream order while folding repeated task identities inside a day. */
export function groupTimelineNotes(notes) {
  const days = new Map();
  for (const note of notes) {
    let day = days.get(note.date);
    if (!day) {
      day = { date: note.date, tasks: [], byTask: new Map() };
      days.set(note.date, day);
    }
    let group = day.byTask.get(note.task.id);
    if (!group) {
      group = { key: `${note.date}:${note.task.id}`, task: note.task, notes: [] };
      day.byTask.set(note.task.id, group);
      day.tasks.push(group);
    }
    group.notes.push(note);
  }
  return [...days.values()].map(({ date, tasks }) => ({ date, tasks }));
}

/** Bulk actions change only currently visible groups and retain off-screen state. */
export function updateCollapsedGroups(current, visible, shouldCollapse) {
  const next = new Set(current);
  for (const key of visible) {
    if (shouldCollapse) next.add(key);
    else next.delete(key);
  }
  return next;
}
