import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { readFile } from "node:fs/promises";
import { dirname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { WorkspaceStore } from "./workspace.ts";

const PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "public");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

export function createApp(workspace: WorkspaceStore): Hono {
  const app = new Hono();

  app.get("/api/backlogs", (c) => c.json({
    backlogs: workspace.list().map((backlog) => ({
      ...backlog,
      tasks: workspace.get(backlog.id)?.list() ?? [],
    })),
  }));

  app.get("/api/backlogs/:backlog/tasks/:key", (c) => {
    const store = workspace.get(c.req.param("backlog"));
    if (!store) return c.json({ error: "backlog not found" }, 404);
    const key = c.req.param("key");
    const task = store.get(key);
    if (!task) return c.json({ error: "not found" }, 404);
    const sameNumber = store.resolve(task.number);
    return c.json({ task, alternatives: sameNumber.length > 1 ? sameNumber.map((t) => t.id) : [] });
  });

  /**
   * Reference files are read on demand, never during the board scan. The path
   * is resolved inside the tasks root and rejected if it escapes it.
   */
  app.get("/api/reference", async (c) => {
    const store = workspace.get(c.req.query("backlog") || "");
    if (!store) return c.json({ error: "backlog not found" }, 404);
    const target = c.req.query("path");
    if (!target) return c.json({ error: "path required" }, 400);

    const cleaned = normalize(target).replace(/^([.][.][/\\])+/, "");
    const root = resolve(store.root);
    const full = resolve(root, cleaned.replace(/^TASKS[/\\]/, ""));
    if (full !== root && !full.startsWith(root + sep)) {
      return c.json({ error: "outside the tasks directory" }, 403);
    }
    try {
      return c.json({ path: cleaned, text: await readFile(full, "utf8") });
    } catch {
      return c.json({ error: "unreadable" }, 404);
    }
  });

  app.get("/api/events", (c) =>
    streamSSE(c, async (stream) => {
      let alive = true;
      let id = 0;

      const send = (event: string, data: unknown) =>
        stream.writeSSE({ event, data: JSON.stringify(data), id: String(++id) });

      // The client refetches /api/tasks on every open, so a reconnect after a
      // missed delta resyncs rather than drifting.
      await send("hello", { backlogs: workspace.list() });

      const queue: Array<[string, unknown]> = [];
      const unsubscribe = workspace.subscribe((backlog, change) => {
        queue.push(["change", { backlog, change }]);
      });

      stream.onAbort(() => {
        alive = false;
        unsubscribe();
      });

      try {
        while (alive) {
          while (queue.length) {
            const next = queue.shift();
            if (next) await send(next[0], next[1]);
          }
          await stream.sleep(250);
          // A comment frame keeps proxies from closing an idle stream.
          if (++id % 100 === 0) await stream.writeSSE({ event: "ping", data: "1" });
        }
      } finally {
        unsubscribe();
      }
    }));

  app.get("/*", async (c) => {
    const path = new URL(c.req.url).pathname;
    const rel = path === "/" ? "index.html" : path.slice(1);
    const cleaned = normalize(rel).replace(/^([.][.][/\\])+/, "");
    const full = resolve(PUBLIC_DIR, cleaned);
    if (!full.startsWith(PUBLIC_DIR + sep) && full !== join(PUBLIC_DIR, "index.html")) {
      return c.notFound();
    }
    const file = Bun.file(full);
    if (!(await file.exists())) {
      // Unknown paths fall through to the shell so hash-free deep links work.
      const shell = Bun.file(join(PUBLIC_DIR, "index.html"));
      if (await shell.exists()) {
        return new Response(shell, { headers: { "content-type": MIME[".html"]! } });
      }
      return c.notFound();
    }
    const ext = full.slice(full.lastIndexOf("."));
    return new Response(file, {
      headers: {
        "content-type": MIME[ext] ?? "application/octet-stream",
        "cache-control": "no-cache",
      },
    });
  });

  return app;
}
