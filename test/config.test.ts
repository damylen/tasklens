import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addBacklog, loadBacklogs, removeBacklog } from "../src/config.ts";

const dirs: string[] = [];
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });

async function configPath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tasklens-config-"));
  dirs.push(dir);
  return join(dir, "nested", "backlogs.json");
}

describe("backlog configuration", () => {
  test("stores a stable id but keeps the user's readable label", async () => {
    const path = await configPath();
    await addBacklog("CS workspace", "/work/cs", path);
    expect(await loadBacklogs(path)).toEqual([{ id: "cs-workspace", label: "CS workspace", dir: "/work/cs" }]);
  });

  test("does not silently replace a backlog with the same stable id", async () => {
    const path = await configPath();
    await addBacklog("CS", "/work/cs", path);
    await expect(addBacklog("cs", "/other", path)).rejects.toThrow("already exists");
  });

  test("removes only the named backlog", async () => {
    const path = await configPath();
    await addBacklog("CS", "/work/cs", path);
    await addBacklog("Other", "/work/other", path);
    expect(await removeBacklog("cs", path)).toBe(true);
    expect((await loadBacklogs(path)).map((backlog) => backlog.id)).toEqual(["other"]);
  });
});
