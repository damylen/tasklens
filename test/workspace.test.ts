import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverTaskDirs, WorkspaceStore } from "../src/workspace.ts";
import { createApp } from "../src/server.ts";
import { loadBacklogs } from "../src/config.ts";

const dirs: string[] = [];
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });

async function backlog(name: string, status: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `tasklens-${name}-`));
  dirs.push(dir);
  await writeFile(join(dir, "0001-same-number.md"), `# 0001 ${name}\n\nStatus: ${status}\n\n## Agent Notes\n- 2026-08-23: started\n`);
  return dir;
}

describe("workspace store", () => {
  // Every backlog may have a 0001. Keeping stores isolated means a relation in
  // one project can never silently resolve to a task file from another project.
  test("keeps same-number tasks and their status isolated by backlog", async () => {
    const [alpha, beta] = await Promise.all([backlog("Alpha", "open"), backlog("Beta", "in_progress")]);
    const workspace = new WorkspaceStore([
      { id: "alpha", label: "Alpha", dir: alpha },
      { id: "beta", label: "Beta", dir: beta },
    ]);
    await workspace.scan();
    expect(workspace.get("alpha")!.get("0001")!.status).toBe("open");
    expect(workspace.get("beta")!.get("0001")!.status).toBe("in_progress");
    expect(workspace.list().map((backlog) => backlog.id)).toEqual(["alpha", "beta"]);
    workspace.close();
  });

  test("serves each backlog with its own task set", async () => {
    const [alpha, beta] = await Promise.all([backlog("Alpha", "open"), backlog("Beta", "in_progress")]);
    const workspace = new WorkspaceStore([
      { id: "alpha", label: "Alpha", dir: alpha },
      { id: "beta", label: "Beta", dir: beta },
    ]);
    await workspace.scan();
    const app = createApp(workspace);
    const payload = await (await app.request("http://tasklens.local/api/backlogs")).json() as { backlogs: Array<{ id: string; tasks: Array<{ status: string }> }> };
    expect(payload.backlogs.map((backlog) => backlog.id)).toEqual(["alpha", "beta"]);
    expect(payload.backlogs[1]!.tasks[0]!.status).toBe("in_progress");
    workspace.close();
  });

  test("adds, scans and persists a backlog through the local server", async () => {
    const [alpha, beta] = await Promise.all([backlog("Alpha", "open"), backlog("Beta", "in_progress")]);
    const workspace = new WorkspaceStore([{ id: "alpha", label: "Alpha", dir: alpha }]);
    await workspace.scan();
    const configPath = join(alpha, "tasklens-backlogs.json");
    const app = createApp(workspace, { configPath });
    const response = await app.request("http://tasklens.local/api/backlogs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "Beta", dir: beta }),
    });
    expect(response.status).toBe(201);
    expect(workspace.get("beta")!.get("0001")!.status).toBe("in_progress");
    expect((await loadBacklogs(configPath)).map((backlog) => backlog.id)).toEqual(["alpha", "beta"]);
    workspace.close();
  });

  test("removes one unreleased candidate through the local API and refreshes the snapshot", async () => {
    const alpha = await backlog("Alpha", "open");
    const notes = join(alpha, "release-notes");
    const file = join(notes, "unreleased.yaml");
    await mkdir(notes, { recursive: true });
    await writeFile(file, `schemaVersion: 1
changes:
  - id: remove-me
    date: 2026-08-23
    type: feature
    summary: Remove this candidate.
    tasks: [1]
  - id: keep-me
    date: 2026-08-23
    type: fix
    summary: Keep this candidate.
    tasks: [1]
`);
    const workspace = new WorkspaceStore([{ id: "alpha", label: "Alpha", dir: alpha }]);
    await workspace.scan();
    const app = createApp(workspace);

    const response = await app.request("http://tasklens.local/api/backlogs/alpha/changes", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "release-notes/unreleased.yaml", id: "remove-me" }),
    });

    expect(response.status).toBe(200);
    const payload = await response.json() as { backlogs: Array<{ changes: Array<{ id: string }> }> };
    expect(payload.backlogs[0]!.changes.map((change) => change.id)).toEqual(["keep-me"]);
    expect(await readFile(file, "utf8")).not.toContain("remove-me");
    expect(workspace.list()[0]!.changes.map((change) => change.id)).toEqual(["keep-me"]);
    workspace.close();
  });

  test("discovers task folders below a project root but skips dependency trees", async () => {
    const root = await mkdtemp(join(tmpdir(), "tasklens-project-"));
    dirs.push(root);
    const tasks = join(root, "packages", "app", "TASKS");
    await mkdir(join(root, "node_modules", "ignored", "TASKS"), { recursive: true });
    await mkdir(tasks, { recursive: true });
    await writeFile(join(tasks, "0001-real.md"), "# 0001 Real\n\nStatus: open\n");
    await mkdir(join(root, "docs", "adr"), { recursive: true });
    await writeFile(join(root, "docs", "adr", "0003-not-a-backlog.md"), "# 0003 Not a backlog\n");
    await writeFile(join(root, "node_modules", "ignored", "TASKS", "0002-ignored.md"), "# 0002 Ignored\n");
    expect(await discoverTaskDirs(root)).toEqual([tasks]);
    const workspace = new WorkspaceStore([{ id: "project", label: "Project", dir: root }]);
    await workspace.scan();
    expect(workspace.get("project")!.meta().total).toBe(1);
    expect(workspace.list()[0]!.dir).toBe(tasks);
    workspace.close();
  });
});
