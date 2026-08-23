import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TaskStore } from "../src/store.ts";

const stores: TaskStore[] = [];
const dirs: string[] = [];

afterEach(async () => {
  for (const store of stores.splice(0)) store.close();
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function fixture(files: Record<string, string>): Promise<TaskStore> {
  const dir = await mkdtemp(join(tmpdir(), "tasklens-"));
  dirs.push(dir);
  for (const [name, body] of Object.entries(files)) {
    await writeFile(join(dir, name), body);
  }
  const store = new TaskStore(dir);
  stores.push(store);
  await store.scan();
  return store;
}

const task = (n: string, extra = "", status = "open") => {
  // `extra` may carry its own Area:, which then replaces the default.
  const area = /^Area:/m.test(extra) ? "" : "Area: demo\n";
  return `# ${n} Task ${n}\n\nStatus: ${status}\nPriority: high\nAgent: Alice\n${area}${extra}\n\n## Agent Notes\n- 2026-08-01: made\n`;
};

const settle = () => new Promise((r) => setTimeout(r, 500));

/**
 * fs.watch arms asynchronously on macOS, so a file written in the same tick as
 * watch() can be missed entirely. Production arms the watcher during startup,
 * long before anyone edits a file; the tests have to wait for it explicitly.
 */
async function armed(store: TaskStore): Promise<void> {
  store.watch(40);
  await new Promise((r) => setTimeout(r, 200));
}

describe("identity", () => {
  // The bug this guards: keying tasks by number silently dropped one of every
  // colliding pair. In a real backlog that lost 126 files without a word.
  test("keeps every file when two of them claim the same number", async () => {
    const store = await fixture({
      "0005-first.md": task("0005"),
      "0005-second.md": task("0005"),
      "0006-other.md": task("0006"),
    });
    expect(store.list()).toHaveLength(3);
    expect(store.resolve("0005").map((t) => t.id).sort())
      .toEqual(["0005-first", "0005-second"]);
  });

  test("flags the collision instead of hiding it", async () => {
    const store = await fixture({ "0005-a.md": task("0005"), "0005-b.md": task("0005") });
    expect(store.list().every((t) => t.duplicateNumber)).toBe(true);
    expect(store.meta().warnings.some((w) => w.field === "Number")).toBe(true);
  });

  test("a unique number is not flagged", async () => {
    const store = await fixture({ "0005-a.md": task("0005") });
    expect(store.get("0005")!.duplicateNumber).toBe(false);
    expect(store.meta().warnings.some((w) => w.field === "Number")).toBe(false);
  });

  test("only NNNN-*.md at the root counts as a task", async () => {
    const store = await fixture({
      "0001-real.md": task("0001"),
      "README.md": "# not a task\n",
      "notes.md": "# also not a task\n",
    });
    expect(store.list().map((t) => t.id)).toEqual(["0001-real"]);
  });
});

describe("derived relations", () => {
  // Reverse edges exist nowhere in the files. Without deriving them there is no
  // way to answer "what is waiting on this task", which is the question that
  // decides what to work on next.
  test("derives the reverse edge that the files never store", async () => {
    const store = await fixture({
      "0001-base.md": task("0001"),
      "0002-waiting.md": task("0002", "Depends on: 0001"),
    });
    expect(store.get("0001-base")!.blocks).toEqual(["0002-waiting"]);
    expect(store.get("0002-waiting")!.dependsOn).toEqual(["0001"]);
  });

  // A parent's Subtasks list drifts out of date; children naming the parent do
  // not. Counting the union is what makes the rollup trustworthy.
  test("rolls up children found by either direction of the link", async () => {
    const store = await fixture({
      "0001-parent.md": task("0001", "\n## Subtasks\n- [x] 0002 Listed child"),
      "0002-listed.md": task("0002", "Parent: 0001", "done"),
      "0003-unlisted.md": task("0003", "Parent: 0001", "in_progress"),
    });
    const parent = store.get("0001-parent")!;
    expect(parent.rollup).toEqual({ open: 0, in_progress: 1, blocked: 0, done: 1, total: 2 });
  });

  // The checkbox in a parent is a hand-maintained copy. The child file is the
  // source of truth, and the rollup must follow the child.
  test("rollup follows the child file, not the parent's checkbox", async () => {
    const store = await fixture({
      "0001-parent.md": task("0001", "\n## Subtasks\n- [x] 0002 Claimed done"),
      "0002-child.md": task("0002", "Parent: 0001", "blocked"),
    });
    expect(store.get("0001-parent")!.rollup!.done).toBe(0);
    expect(store.get("0001-parent")!.rollup!.blocked).toBe(1);
  });
});

describe("watching", () => {
  test("an edit emits the changed task", async () => {
    const store = await fixture({ "0001-a.md": task("0001") });
    await armed(store);
    const seen: string[] = [];
    store.subscribe((change) => {
      if (change.type === "upsert") seen.push(...change.tasks.map((t) => t.id));
    });

    await writeFile(join(store.root, "0001-a.md"), task("0001", "", "done"));
    await settle();

    expect(seen).toContain("0001-a");
    expect(store.get("0001-a")!.status).toBe("done");
  });

  // A rollup lives on the parent, so editing a child has to notify the parent
  // too or the board keeps showing a stale count.
  test("editing a child ships the parent as well, so its rollup is not stale", async () => {
    const store = await fixture({
      "0001-parent.md": task("0001", "\n## Subtasks\n- [ ] 0002 Child"),
      "0002-child.md": task("0002", "Parent: 0001"),
    });
    await armed(store);
    const seen = new Set<string>();
    store.subscribe((change) => {
      if (change.type === "upsert") for (const t of change.tasks) seen.add(t.id);
    });

    await writeFile(join(store.root, "0002-child.md"), task("0002", "Parent: 0001", "done"));
    await settle();

    expect(seen.has("0001-parent")).toBe(true);
    expect(store.get("0001-parent")!.rollup!.done).toBe(1);
  });

  test("a new file arrives as an upsert", async () => {
    const store = await fixture({ "0001-a.md": task("0001") });
    await armed(store);
    const seen: string[] = [];
    store.subscribe((change) => {
      if (change.type === "upsert") seen.push(...change.tasks.map((t) => t.id));
    });

    await writeFile(join(store.root, "0009-new.md"), task("0009"));
    await settle();

    expect(seen).toContain("0009-new");
    expect(store.meta().total).toBe(2);
  });

  test("a deleted file is removed rather than left behind", async () => {
    const store = await fixture({ "0001-a.md": task("0001"), "0002-b.md": task("0002") });
    await armed(store);
    const removed: string[] = [];
    store.subscribe((change) => {
      if (change.type === "remove") removed.push(...change.numbers);
    });

    await rm(join(store.root, "0002-b.md"));
    await settle();

    expect(removed).toContain("0002-b");
    expect(store.get("0002-b")).toBeUndefined();
    expect(store.meta().total).toBe(1);
  });

  // A failing subscriber must not take the rest of the fan-out down with it,
  // or one broken SSE stream would freeze every other connected browser.
  test("one failing subscriber does not stop the others", async () => {
    const store = await fixture({ "0001-a.md": task("0001") });
    await armed(store);
    let reached = false;
    store.subscribe(() => { throw new Error("boom"); });
    store.subscribe(() => { reached = true; });

    await writeFile(join(store.root, "0001-a.md"), task("0001", "", "done"));
    await settle();

    expect(reached).toBe(true);
  });
});

describe("reconciliation", () => {
  // fs.watch is a hint, not a guarantee: on macOS it stops reporting changes to
  // a file once that file has been replaced by a rename, which is what `sed -i`
  // and most editors' atomic save do. Without a sweep the dashboard silently
  // freezes while still looking live — so the sweep, not the watcher, is what
  // makes freshness a guarantee. These tests run with the watcher OFF so they
  // fail if the sweep ever stops carrying that weight on its own.
  test("picks up an edit the watcher never reported", async () => {
    const store = await fixture({ "0001-a.md": task("0001") });
    expect(store.get("0001-a")!.status).toBe("open");

    await writeFile(join(store.root, "0001-a.md"), task("0001", "", "done"));
    await store.reconcile();

    expect(store.get("0001-a")!.status).toBe("done");
  });

  test("picks up a file that appeared unseen", async () => {
    const store = await fixture({ "0001-a.md": task("0001") });
    await writeFile(join(store.root, "0009-new.md"), task("0009"));
    await store.reconcile();
    expect(store.get("0009-new")).toBeDefined();
    expect(store.meta().total).toBe(2);
  });

  test("drops a file that disappeared unseen", async () => {
    const store = await fixture({ "0001-a.md": task("0001"), "0002-b.md": task("0002") });
    await rm(join(store.root, "0002-b.md"));
    await store.reconcile();
    expect(store.get("0002-b")).toBeUndefined();
    expect(store.meta().total).toBe(1);
  });

  test("repairs a parent rollup after a missed child edit", async () => {
    const store = await fixture({
      "0001-parent.md": task("0001", "\n## Subtasks\n- [ ] 0002 Child"),
      "0002-child.md": task("0002", "Parent: 0001"),
    });
    expect(store.get("0001-parent")!.rollup!.done).toBe(0);

    await writeFile(join(store.root, "0002-child.md"), task("0002", "Parent: 0001", "done"));
    await store.reconcile();

    expect(store.get("0001-parent")!.rollup!.done).toBe(1);
  });

  test("emits the change so connected browsers hear about it", async () => {
    const store = await fixture({ "0001-a.md": task("0001") });
    const seen: string[] = [];
    store.subscribe((change) => {
      if (change.type === "upsert") seen.push(...change.tasks.map((t) => t.id));
    });

    await writeFile(join(store.root, "0001-a.md"), task("0001", "", "done"));
    await store.reconcile();

    expect(seen).toContain("0001-a");
  });

  // An idle sweep must stay silent, or every connected browser would rerender
  // on a timer for no reason.
  test("says nothing when nothing changed", async () => {
    const store = await fixture({ "0001-a.md": task("0001") });
    let emitted = 0;
    store.subscribe(() => { emitted++; });
    await store.reconcile();
    await store.reconcile();
    expect(emitted).toBe(0);
  });
});

describe("counts", () => {
  test("meta counts every task exactly once", async () => {
    const store = await fixture({
      "0001-a.md": task("0001", "", "open"),
      "0002-b.md": task("0002", "", "done"),
      "0003-c.md": task("0003", "", "done"),
      "0004-d.md": task("0004", "", "blocked"),
    });
    const meta = store.meta();
    expect(meta.counts).toEqual({ open: 1, in_progress: 0, blocked: 1, done: 2 });
    expect(meta.total).toBe(4);
    expect(Object.values(meta.counts).reduce((a, b) => a + b, 0)).toBe(meta.total);
  });
});

describe("area paths", () => {
  // Areas drift between `/` and `-`. Left alone the filter shows two separate
  // `client` groups, which is worse than useless — it hides half the work.
  test("folds a dashed head onto its slash form when both halves are real", async () => {
    const store = await fixture({
      "0001-a.md": task("0001", "Area: web/app"),
      "0002-b.md": task("0002", "Area: web-app"),
    });
    expect(store.get("0002-b")!.areaPaths).toEqual(["web/app"]);
    expect(store.meta().areaFolds).toBe(1);
  });

  // The guard that keeps the fold from being a blunt find-and-replace: without
  // it, `design-system` would be shredded into `design/system`.
  test("leaves a dashed name alone when its halves are not a real path", async () => {
    const store = await fixture({
      "0001-a.md": task("0001", "Area: platform/design-system"),
      "0002-b.md": task("0002", "Area: ci-cd"),
    });
    expect(store.get("0001-a")!.areaPaths).toEqual(["platform/design-system"]);
    expect(store.get("0002-b")!.areaPaths).toEqual(["ci-cd"]);
    expect(store.meta().areaFolds).toBe(0);
  });

  test("treats whitespace as a deeper separator", async () => {
    const store = await fixture({ "0001-a.md": task("0001", "Area: web/app editor") });
    expect(store.get("0001-a")!.areaPaths).toEqual(["web/app/editor"]);
  });

  // A task can legitimately touch several areas; it must appear under each.
  test("keeps every area of a comma-separated list", async () => {
    const store = await fixture({ "0001-a.md": task("0001", "Area: web/app, server/api") });
    expect(store.get("0001-a")!.areaPaths).toEqual(["server/api", "web/app"]);
  });

  test("a task with no area has no paths rather than an empty one", async () => {
    const store = await fixture({ "0001-a.md": task("0001", "Area:") });
    expect(store.get("0001-a")!.areaPaths).toEqual([]);
  });
});
