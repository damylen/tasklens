import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkspaceStore } from "../src/workspace.ts";
import { createApp } from "../src/server.ts";

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
});
