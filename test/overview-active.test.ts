import { expect, test } from "bun:test";
import { recentEntries } from "../public/views/overview.js";

test("active-only Overview entries exclude inactive tasks", () => {
  const now = Date.now();
  const active = {
    id: "active", status: "in_progress", mtime: now - 100,
    notes: [{ date: "2026-08-24", text: "active note" }],
  };
  const stale = {
    id: "stale", status: "in_progress", mtime: now - 3_600_001,
    notes: [{ date: "2026-08-24", text: "stale note" }],
  };
  const open = {
    id: "open", status: "open", mtime: now - 100,
    notes: [{ date: "2026-08-24", text: "open note" }],
  };
  const backlog = { tasks: new Map([[active.id, active], [stale.id, stale], [open.id, open]]) };

  expect(recentEntries(backlog, 14, true).map((entry) => entry.task.id)).toEqual(["active"]);
  expect(recentEntries(backlog).map((entry) => entry.task.id).sort()).toEqual(["active", "open", "stale"]);
});
