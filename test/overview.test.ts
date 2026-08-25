import { describe, expect, test } from "bun:test";
import { recentEntries, recentGroups } from "../public/views/overview.js";

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

  test("uses the timeline day and task grouping inside a project plane", () => {
    const task = {
      id: "0001-a", mtime: 2, status: "in_progress",
      notes: [
        { date: "2026-08-24", text: "one" },
        { date: "2026-08-24", text: "two" },
        { date: "2026-08-23", text: "older" },
      ],
    };
    const groups = recentGroups({ tasks: new Map([[task.id, task]]) });

    expect(groups.map((group: { date: string }) => group.date)).toEqual(["2026-08-24", "2026-08-23"]);
    expect(groups[0]!.tasks[0]!.notes.map((note: { text: string }) => note.text)).toEqual(["one", "two"]);
    expect(groups[1]!.tasks[0]!.key).toBe("2026-08-23:0001-a");
  });

  test("keeps Home disclosure separate from task navigation", async () => {
    // A single click target would make collapsing a Home group navigate away.
    const source = await Bun.file(new URL("../public/views/overview.js", import.meta.url)).text();
    expect(source).toContain("button.project-task-toggle");
    expect(source).toContain("button.project-task-link");
    expect(source).toContain('"aria-expanded": open');
  });
});
