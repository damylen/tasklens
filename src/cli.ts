import { existsSync, statSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { addBacklog, loadBacklogs, removeBacklog } from "./config.ts";
import { createApp } from "./server.ts";
import { WorkspaceStore } from "./workspace.ts";

const VERSION = "0.1.0";
const DEFAULT_PORT = 4321;

interface Options {
  dir: string | null;
  command: "serve" | "backlog" | null;
  backlogCommand: "add" | "list" | "remove" | null;
  backlogArgs: string[];
  backlogs: Array<{ id: string; label: string; dir: string }>;
  port: number | null;
  host: string;
  open: boolean;
  help: boolean;
  version: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    dir: null, command: null, backlogCommand: null, backlogArgs: [], backlogs: [],
    port: null, host: "127.0.0.1", open: true, help: false, version: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--version" || arg === "-v") options.version = true;
    else if (arg === "--no-open") options.open = false;
    else if (arg === "--open") options.open = true;
    else if (arg === "--port" || arg === "-p") options.port = Number(argv[++i]);
    else if (arg.startsWith("--port=")) options.port = Number(arg.slice(7));
    else if (arg === "--host") options.host = String(argv[++i] ?? options.host);
    else if (arg.startsWith("--host=")) options.host = arg.slice(7);
    else if (arg === "--backlog") {
      const raw = String(argv[++i] ?? "");
      const split = raw.indexOf("=");
      if (split > 0) options.backlogs.push({
        id: raw.slice(0, split).trim().toLowerCase(), label: raw.slice(0, split).trim(), dir: raw.slice(split + 1),
      });
    } else if (arg.startsWith("--backlog=")) {
      const raw = arg.slice(10);
      const split = raw.indexOf("=");
      if (split > 0) options.backlogs.push({
        id: raw.slice(0, split).trim().toLowerCase(), label: raw.slice(0, split).trim(), dir: raw.slice(split + 1),
      });
    } else if (arg === "serve" && !options.command) options.command = "serve";
    else if (arg === "backlog" && !options.command) {
      options.command = "backlog";
      const action = argv[++i];
      options.backlogCommand = action === "add" || action === "list" || action === "remove" ? action : null;
      options.backlogArgs = argv.slice(i + 1);
      break;
    } else if (!arg.startsWith("-")) options.dir = arg;
  }
  return options;
}

/**
 * Resolution order, so `tasklens` does the right thing from anywhere in a repo:
 *   1. an explicit argument, used as-is if it is itself a tasks directory
 *   2. `TASKS/` (or `tasks/`) beside the current directory
 *   3. the current directory, if it is itself named TASKS
 *   4. the nearest `TASKS/` in a parent directory
 */
function findTasksDir(start: string): string | null {
  const named = (dir: string): string | null => {
    for (const name of ["TASKS", "tasks"]) {
      const candidate = resolve(dir, name);
      if (existsSync(candidate) && statSync(candidate).isDirectory()) return candidate;
    }
    return null;
  };

  const here = named(start);
  if (here) return here;
  if (/^tasks$/i.test(basename(start))) return start;

  let dir = start;
  for (let depth = 0; depth < 24; depth++) {
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
    const found = named(dir);
    if (found) return found;
  }
  return null;
}

/** Lets several folders be served at once without the user assigning ports. */
async function pickPort(host: string, preferred: number | null): Promise<number> {
  const first = preferred ?? DEFAULT_PORT;
  const span = preferred ? 1 : 40;
  for (let port = first; port < first + span; port++) {
    try {
      const probe = Bun.serve({ port, hostname: host, fetch: () => new Response("") });
      probe.stop(true);
      return port;
    } catch {
      /* in use, try the next one */
    }
  }
  if (preferred) throw new Error(`port ${preferred} is already in use`);
  throw new Error(`no free port between ${first} and ${first + span}`);
}

function openBrowser(url: string): void {
  const command =
    process.platform === "darwin" ? ["open", url]
    : process.platform === "win32" ? ["cmd", "/c", "start", "", url]
    : ["xdg-open", url];
  try {
    Bun.spawn(command, { stdout: "ignore", stderr: "ignore" });
  } catch {
    /* opening a browser is a convenience, never a failure */
  }
}

const HELP = `
  tasklens ${VERSION}

  A live dashboard for a markdown TASKS/ backlog.

  Usage
  tasklens [directory] [options]
  tasklens serve [options]
  tasklens backlog <add|list|remove> [...]

  Options
    -p, --port <n>   Port to listen on. Defaults to the first free port from ${DEFAULT_PORT}.
        --host <h>   Interface to bind. Defaults to 127.0.0.1.
        --no-open    Do not open a browser.
        --backlog <name=dir>
                      Add a backlog for this one server process; repeatable.
    -v, --version    Print the version.
    -h, --help       Print this help.

  Examples
    tasklens                 Serve the TASKS/ directory found from here.
    tasklens ~/work/repo     Serve that repo's TASKS/ directory.
    tasklens --port 5000     Pin the port.
    tasklens backlog add cs ~/work/cs
    tasklens backlog list
    tasklens serve           Serve every saved backlog.
    tasklens serve --backlog cs=~/work/cs --backlog app=~/work/app

  Saved backlog names and paths live in your local config, never in TASKS/.
`;

async function manageBacklogs(options: Options): Promise<void> {
  if (options.backlogCommand === "list") {
    const backlogs = await loadBacklogs();
    if (!backlogs.length) console.log("No saved backlogs. Add one with: tasklens backlog add <name> <directory>");
    else for (const backlog of backlogs) console.log(`${backlog.id}\t${backlog.label}\t${backlog.dir}`);
    return;
  }
  const [name, dir] = options.backlogArgs;
  if (options.backlogCommand === "add") {
    if (!name || !dir) throw new Error("usage: tasklens backlog add <name> <directory>");
    const root = resolve(dir);
    if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error(`no directory found at ${root}`);
    const backlog = await addBacklog(name, root);
    console.log(`saved ${backlog.label} (${backlog.id}) → ${backlog.dir}`);
    return;
  }
  if (options.backlogCommand === "remove") {
    if (!name) throw new Error("usage: tasklens backlog remove <name>");
    if (!await removeBacklog(name)) throw new Error(`no saved backlog named '${name}'`);
    console.log(`removed ${name}`);
    return;
  }
  throw new Error("usage: tasklens backlog <add|list|remove>");
}

export async function main(argv = Bun.argv.slice(2)): Promise<void> {
  const options = parseArgs(argv);

  if (options.help) { console.log(HELP); return; }
  if (options.version) { console.log(VERSION); return; }
  if (options.command === "backlog") { await manageBacklogs(options); return; }

  let backlogs = options.backlogs.map((backlog) => ({ ...backlog, dir: resolve(backlog.dir) }));
  if (options.command === "serve" && !backlogs.length) backlogs = await loadBacklogs();
  if (!backlogs.length) {
    const start = resolve(options.dir ?? process.cwd());
    if (!existsSync(start)) {
      console.error(`tasklens: no such directory: ${start}`);
      process.exit(1);
    }
    const root = findTasksDir(start);
    if (!root) {
      console.error(`tasklens: no TASKS/ directory found at or above ${start}`);
      console.error(`           create one, or point at it: tasklens path/to/TASKS`);
      process.exit(1);
    }
    backlogs = [{ id: "local", label: basename(dirname(root)) || "backlog", dir: root }];
  }
  if (backlogs.some((backlog) => !backlog.id || !backlog.dir)) {
    console.error("tasklens: every --backlog value needs name=directory with a TASKS/ folder");
    process.exit(1);
  }
  for (const backlog of backlogs) {
    if (!existsSync(backlog.dir) || !statSync(backlog.dir).isDirectory()) {
      console.error(`tasklens: backlog '${backlog.label}' is not a readable TASKS/ directory: ${backlog.dir}`);
      process.exit(1);
    }
  }

  const workspace = new WorkspaceStore(backlogs);
  const began = Date.now();
  await workspace.scan();
  const snapshots = workspace.list();
  if (!snapshots.some((backlog) => backlog.meta.total)) {
    console.error("tasklens: configured backlogs hold no NNNN-*.md task files");
    process.exit(1);
  }
  workspace.watch();

  let port: number;
  try {
    port = await pickPort(options.host, options.port);
  } catch (error) {
    console.error(`tasklens: ${(error as Error).message}`);
    process.exit(1);
  }

  const app = createApp(workspace);
  const server = Bun.serve({ port, hostname: options.host, fetch: app.fetch });
  const url = `http://${options.host}:${port}`;

  console.log(`
  tasklens ${VERSION}

  serving  ${snapshots.length} backlog${snapshots.length === 1 ? "" : "s"}
${snapshots.map((backlog) => {
    const { open, in_progress, blocked, done } = backlog.meta.counts;
    return `  ${backlog.label}\t${backlog.meta.total} tasks · ${open} open · ${in_progress} in progress · ${blocked} blocked · ${done} done`;
  }).join("\n")}
  parsed   ${Date.now() - began}ms
  url      ${url}
`);

  console.log("  watching for changes — ctrl-c to stop\n");

  if (options.open) openBrowser(url);

  const shutdown = () => {
    workspace.close();
    server.stop(true);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
