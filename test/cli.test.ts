import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { restoreSavedBacklogs } from "../src/cli.ts";
import { saveBacklogs } from "../src/config.ts";

const dirs: string[] = [];
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });

describe("CLI startup backlogs", () => {
  test("restores web-added projects beside the directly opened local project", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tasklens-startup-"));
    dirs.push(dir);
    const configPath = join(dir, "backlogs.json");
    const local = { id: "local", label: "TaskLens", dir: join(dir, "TASKS") };
    const added = { id: "photo-app", label: "Photo app", dir: join(dir, "photo-app", "TASKS") };
    await saveBacklogs([local, added], configPath);

    expect(await restoreSavedBacklogs([local], configPath)).toEqual([local, added]);
  });

  test("keeps the directly opened project when saved ids or directories conflict", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tasklens-startup-"));
    dirs.push(dir);
    const configPath = join(dir, "backlogs.json");
    const local = { id: "local", label: "Current project", dir: join(dir, "current", "TASKS") };
    await saveBacklogs([
      { id: "local", label: "Old local", dir: join(dir, "old", "TASKS") },
      { id: "duplicate-path", label: "Duplicate path", dir: local.dir },
      { id: "other", label: "Other", dir: join(dir, "other", "TASKS") },
    ], configPath);

    expect(await restoreSavedBacklogs([local], configPath)).toEqual([
      local,
      { id: "other", label: "Other", dir: join(dir, "other", "TASKS") },
    ]);
  });
});
