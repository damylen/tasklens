import { existsSync, statSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { createApp } from "./server.ts";
import { TaskStore } from "./store.ts";

const VERSION = "0.1.0";
const DEFAULT_PORT = 4321;

interface Options {
  dir: string | null;
  port: number | null;
  host: string;
  open: boolean;
  help: boolean;
  version: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    dir: null, port: null, host: "127.0.0.1", open: true, help: false, version: false,
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
    else if (!arg.startsWith("-")) options.dir = arg;
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

  Options
    -p, --port <n>   Port to listen on. Defaults to the first free port from ${DEFAULT_PORT}.
        --host <h>   Interface to bind. Defaults to 127.0.0.1.
        --no-open    Do not open a browser.
    -v, --version    Print the version.
    -h, --help       Print this help.

  Examples
    tasklens                 Serve the TASKS/ directory found from here.
    tasklens ~/work/repo     Serve that repo's TASKS/ directory.
    tasklens --port 5000     Pin the port.

  Run it in as many folders as you like: each instance takes the next free port.
`;

export async function main(argv = Bun.argv.slice(2)): Promise<void> {
  const options = parseArgs(argv);

  if (options.help) { console.log(HELP); return; }
  if (options.version) { console.log(VERSION); return; }

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

  const store = new TaskStore(root);
  const began = Date.now();
  await store.scan();
  const meta = store.meta();

  if (!meta.total) {
    console.error(`tasklens: ${root} holds no NNNN-*.md task files`);
    process.exit(1);
  }

  store.watch();

  let port: number;
  try {
    port = await pickPort(options.host, options.port);
  } catch (error) {
    console.error(`tasklens: ${(error as Error).message}`);
    process.exit(1);
  }

  const app = createApp(store);
  const server = Bun.serve({ port, hostname: options.host, fetch: app.fetch });
  const url = `http://${options.host}:${port}`;

  const { open, in_progress, blocked, done } = meta.counts;
  console.log(`
  tasklens ${VERSION}

  serving  ${root}
  tasks    ${meta.total}  ·  ${open} open  ${in_progress} in progress  ${blocked} blocked  ${done} done
  notes    ${meta.noteCount}
  parsed   ${Date.now() - began}ms
  url      ${url}
`);

  if (meta.warnings.length) {
    console.log(`  ${meta.warnings.length} file(s) needed a fallback:`);
    for (const warning of meta.warnings.slice(0, 10)) {
      console.log(`    ${warning.file}  ${warning.field}="${warning.value}"  ${warning.message}`);
    }
    if (meta.warnings.length > 10) {
      console.log(`    ... and ${meta.warnings.length - 10} more`);
    }
    console.log("");
  }

  console.log("  watching for changes — ctrl-c to stop\n");

  if (options.open) openBrowser(url);

  const shutdown = () => {
    store.close();
    server.stop(true);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
