import { describe, expect, test } from "bun:test";
import { isTypingTarget, resolveShortcut } from "../public/lib/shortcuts.js";

const backlogs = [
  { id: "tasklens", label: "tasklens" },
  { id: "cs", label: "cs" },
  { id: "media-lib", label: "media-lib" },
];

describe("toolbar shortcuts", () => {
  test("number keys select projects in displayed order", () => {
    expect(resolveShortcut("1", backlogs)).toMatchObject({ type: "project", backlog: backlogs[0] });
    expect(resolveShortcut("3", backlogs)).toMatchObject({ type: "project", backlog: backlogs[2] });
    expect(resolveShortcut("4", backlogs)).toBeNull();
  });

  test("letter keys resolve views, overview and search", () => {
    expect(resolveShortcut("t", backlogs)).toEqual({ type: "view", id: "timeline", key: "T" });
    expect(resolveShortcut("K", backlogs)).toEqual({ type: "view", id: "kanban", key: "K" });
    expect(resolveShortcut("g", backlogs)).toEqual({ type: "view", id: "groups", key: "G" });
    expect(resolveShortcut("f", backlogs)).toEqual({ type: "view", id: "files", key: "F" });
    expect(resolveShortcut("u", backlogs)).toEqual({ type: "view", id: "changes", key: "U" });
    expect(resolveShortcut("o", backlogs)).toEqual({ type: "overview", key: "O" });
    expect(resolveShortcut("a", backlogs)).toEqual({ type: "active", key: "A" });
    expect(resolveShortcut("d", backlogs)).toEqual({ type: "toggleDone", key: "D" });
    expect(resolveShortcut("/", backlogs)).toEqual({ type: "search", key: "/" });
  });

  test("editing controls suppress navigation shortcuts", () => {
    const target = (match: boolean) => ({ closest: () => match ? {} : null });
    expect(isTypingTarget(target(true))).toBe(true);
    expect(isTypingTarget(target(false))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
