import { describe, expect, test } from "bun:test";
import { parseTask } from "../src/parse.ts";

const build = (text: string, file = "0001-a-task.md") =>
  parseTask({ file, path: `/tmp/${file}`, text, mtime: 0, size: text.length });

const header = (extra = "") => `# 0001 A task

Status: open
Priority: high
Owner: user
Agent: Alice
Area: demo
${extra}
`;

describe("status normalization", () => {
  // The board has explicit columns, but files carry a wider vocabulary. Folding has
  // to be lossless: a reader must still be able to see what the file said.
  test("folds a variant spelling but keeps the raw string visible", () => {
    const { task } = build(header().replace("Status: open", "Status: in-progress"));
    expect(task.status).toBe("in_progress");
    expect(task.statusRaw).toBe("in-progress");
  });

  test("folds a multi-word status by its meaningful token", () => {
    const { task } = build(header().replace("Status: open", "Status: investigation complete"));
    expect(task.status).toBe("done");
    expect(task.statusRaw).toBe("investigation complete");
  });

  test("keeps an uncommitted idea outside the operational backlog", () => {
    const { task, warnings } = build(header().replace("Status: open", "Status: wishlist"));
    expect(task.status).toBe("wishlist");
    expect(task.statusRaw).toBe("wishlist");
    expect(warnings.some((w) => w.field === "Status")).toBe(false);
  });

  // Silently filing an unreadable status under `open` would make the board lie
  // about what is actually outstanding, so it must be reported.
  test("warns rather than guessing when the status is unreadable", () => {
    const { task, warnings } = build(header().replace("Status: open", "Status: throwaway prototype"));
    expect(task.status).toBe("open");
    expect(warnings.some((w) => w.field === "Status")).toBe(true);
  });

  test("warns when the Status field is absent entirely", () => {
    const { warnings } = build("# 0001 A task\n\nPriority: high\n\n## Context\nx\n");
    expect(warnings.some((w) => w.field === "Status" && w.value === "")).toBe(true);
  });
});

describe("agent notes", () => {
  const withNotes = (body: string) => build(`${header()}\n## Agent Notes\n${body}\n`);

  // Four shapes occur in real files. Losing the agent means the timeline
  // attributes work to whoever happens to own the task header instead.
  test("reads the four dated-entry shapes", () => {
    const { task } = withNotes(
      [
        "- 2026-08-01: plain entry",
        "- 2026-08-02 Alice: named entry",
        "- 2026-08-03 (Bruno): parenthesised entry",
        "- 2026-08-04 instruction tuning loop 1",
      ].join("\n"),
    );
    expect(task.notes.map((n) => n.agent)).toEqual([null, "Alice", "Bruno", null]);
    expect(task.notes[3]!.text).toBe("instruction tuning loop 1");
  });

  // Long agent entries wrap across indented lines. Dropping the continuation
  // silently truncates the record of what an agent actually did.
  test("absorbs indented continuation lines into the entry above", () => {
    const { task } = withNotes("- 2026-08-01: first line\n  second line\n  third line\n- 2026-08-02: next entry");
    expect(task.notes).toHaveLength(2);
    expect(task.notes[0]!.text).toBe("first line second line third line");
  });

  // lastActivity drives card age and timeline ordering. Taking the last line
  // rather than the newest date would misorder any out-of-order note block.
  test("takes lastActivity from the newest date, not the last line", () => {
    const { task } = withNotes("- 2026-08-09: newer\n- 2026-08-02: older written afterwards");
    expect(task.lastActivity).toBe("2026-08-09");
  });

  test("a task with no notes has no activity date rather than a fake one", () => {
    const { task } = build(header());
    expect(task.lastActivity).toBeNull();
  });
});

describe("relations", () => {
  // The three reference spellings all appear in real backlogs; a missed one
  // silently breaks a parent link and empties a rollup.
  test("normalizes every reference spelling to a bare number", () => {
    const { task } = build(header("Parent: 1947-editor-ai-roadmap.md\nDepends on: 0466, 0468-awp-harnessing, 1949-rehost.md"));
    expect(task.parent).toBe("1947");
    expect(task.dependsOn).toEqual(["0466", "0468", "1949"]);
  });

  test("treats `none` as no relation at all", () => {
    const { task } = build(header("Parent: none\nDepends on: none"));
    expect(task.parent).toBeNull();
    expect(task.dependsOn).toEqual([]);
  });
});

describe("subtasks", () => {
  // Both list styles occur. The checkbox is advisory: the child file's own
  // Status is the truth, so the checkbox is recorded but never trusted here.
  test("reads checkbox and plain subtask lines, recording the box separately", () => {
    const { task } = build(`${header()}\n## Subtasks\n- [x] 0942 Done child\n- [ ] 0944 Todo child\n- 0873 Unboxed child\n`);
    expect(task.subtasks).toEqual([
      { number: "0942", title: "Done child", checked: true },
      { number: "0944", title: "Todo child", checked: false },
      { number: "0873", title: "Unboxed child", checked: null },
    ]);
  });

  test("`- none` is not a subtask", () => {
    const { task } = build(`${header()}\n## Subtasks\n- none\n`);
    expect(task.subtasks).toEqual([]);
  });
});

describe("references", () => {
  // A markdown link contains a comma in its parentheses often enough that a
  // naive split would tear the link in half and lose the target.
  test("separates links, urls and paths without splitting inside a link", () => {
    const { task } = build(header(
      "References: [notes, extended](references/0001-notes.md), https://docs.example.com/guide, plain/path.md",
    ));
    expect(task.references.map((r) => r.kind)).toEqual(["path", "url", "path"]);
    expect(task.references[0]!.target).toBe("references/0001-notes.md");
    expect(task.references[0]!.label).toBe("notes, extended");
  });

  // Known limit, asserted so it is a recorded decision rather than a surprise:
  // a bare URL containing a comma is indistinguishable from two entries. No
  // real backlog file has one, and guessing would break the common case.
  test("a bare url containing a comma is split, which is accepted", () => {
    const { task } = build(header("References: https://example.com/a,b"));
    expect(task.references).toHaveLength(2);
  });
});

describe("identity", () => {
  // Task numbers collide when concurrent agents both take "the next number".
  // The filename is what actually distinguishes two such tasks.
  test("identity comes from the filename, not the number", () => {
    const a = build(header(), "0005-first-thing.md").task;
    const b = build(header(), "0005-second-thing.md").task;
    expect(a.number).toBe(b.number);
    expect(a.id).not.toBe(b.id);
  });

  test("falls back to the filename when the heading has no title", () => {
    const { task } = build("Status: open\n", "0007-some-kebab-title.md");
    expect(task.title).toBe("some kebab title");
    expect(task.number).toBe("0007");
  });
});
