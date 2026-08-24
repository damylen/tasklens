import { expect, test } from "bun:test";
import { activeWorkCount, isActiveWorkTask } from "../public/lib/activity.js";

test("ACTIVE · 1H counts only recently touched in-progress tasks", () => {
  const now = 10_000_000;
  const tasks = [
    { status: "in_progress", mtime: now - 1 },
    { status: "in_progress", mtime: now - 3_600_000 },
    { status: "in_progress", mtime: now - 3_600_001 },
    { status: "open", mtime: now - 1 },
    { status: "blocked", mtime: now - 1 },
    { status: "done", mtime: now - 1 },
  ];

  expect(activeWorkCount(tasks, now)).toBe(2);
  expect(isActiveWorkTask(tasks[0], now)).toBe(true);
  expect(isActiveWorkTask(tasks[2], now)).toBe(false);
  expect(isActiveWorkTask(tasks[3], now)).toBe(false);
});
