import { describe, expect, test } from "bun:test";
import { recentEntries } from "../public/views/overview.js";

describe("project timeline home", () => {
  // The home planes are project-local: interleaving their notes would hide the
  // project boundary the overview is meant to make visible.
  test("orders each project's recent notes independently", () => {
    const task = (id: string, mtime: number, dates: string[]) => ({
      id, mtime, notes: dates.map((date) => ({ date, text: id, agent: null })),
    });
    const project = { tasks: new Map([
      ["older", task("older", 1, ["2026-08-20"])],
      ["newer", task("newer", 2, ["2026-08-23", "2026-08-21"])],
    ]) };
    expect(recentEntries(project).map((entry) => `${entry.task.id}:${entry.note.date}`))
      .toEqual(["newer:2026-08-23", "newer:2026-08-21", "older:2026-08-20"]);
  });
});
