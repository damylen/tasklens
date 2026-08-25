import { expect, test } from "bun:test";
import { groupTimelineNotes, updateCollapsedGroups } from "../public/lib/timeline.js";

test("timeline groups notes by day and then by task without changing order", () => {
  const taskA = { id: "0001-a", number: "0001" };
  const taskB = { id: "0002-b", number: "0002" };
  const groups = groupTimelineNotes([
    { date: "2026-08-24", text: "latest A", task: taskA },
    { date: "2026-08-24", text: "B", task: taskB },
    { date: "2026-08-24", text: "earlier A", task: taskA },
    { date: "2026-08-23", text: "older A", task: taskA },
  ]);

  expect(groups.map((group: { date: string }) => group.date)).toEqual(["2026-08-24", "2026-08-23"]);
  expect(groups[0]!.tasks.map((group: { task: { id: string } }) => group.task.id)).toEqual(["0001-a", "0002-b"]);
  expect(groups[0]!.tasks[0]!.notes.map((note: { text: string }) => note.text)).toEqual(["latest A", "earlier A"]);
  expect(groups[1]!.tasks[0]!.key).toBe("2026-08-23:0001-a");
});

test("bulk disclosure changes visible groups without losing hidden state", () => {
  const collapsed = new Set(["older:hidden", "today:a"]);

  const closed = updateCollapsedGroups(collapsed, ["today:a", "today:b"], true);
  expect([...closed].sort()).toEqual(["older:hidden", "today:a", "today:b"]);

  const opened = updateCollapsedGroups(closed, ["today:a", "today:b"], false);
  expect([...opened]).toEqual(["older:hidden"]);
});

test("timeline disclosure is accessible and does not replace task navigation", async () => {
  // If these become one click target again, users cannot collapse a group
  // without navigating away and keyboard users lose the disclosed state.
  const source = await Bun.file(new URL("../public/views/timeline.js", import.meta.url)).text();
  expect(source).toContain('button.timeline-task-toggle');
  expect(source).toContain('button.timeline-task-link');
  expect(source).toContain('"aria-expanded": open');
  expect(source).toContain('"aria-controls": bodyId');
});
