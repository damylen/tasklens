import { readdir } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";
import type { Change } from "./store.ts";
import { TaskStore } from "./store.ts";
import type { BacklogConfig } from "./config.ts";
import type { Meta } from "./types.ts";

const TASK_FILE = /^\d{4,}[-_].*\.md$/;
const SKIP_DIRS = new Set([".git", ".hg", ".svn", "node_modules", "dist", "build", "coverage", ".next"]);

export interface BacklogSnapshot extends BacklogConfig { meta: Meta; }
type Listener = (backlog: BacklogSnapshot, change: Change) => void;
type Entry = { config: BacklogConfig; store: TaskStore };

/** Discovers task directories once; only the directories found here are watched. */
export async function discoverTaskDirs(root: string): Promise<string[]> {
  const found: string[] = [];
  const queue = [resolve(root)];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const dir = queue[cursor]!;
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { continue; }
    const isTaskRoot = dir === queue[0] || /^tasks$/i.test(basename(dir));
    if (isTaskRoot && entries.some((entry) => entry.isFile() && TASK_FILE.test(entry.name))) found.push(dir);
    for (const entry of entries) {
      if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) queue.push(resolve(dir, entry.name));
    }
  }
  return found.sort();
}

/** A live workspace coordinates isolated task graphs without ever merging them. */
export class WorkspaceStore {
  private configured = new Map<string, BacklogConfig>();
  private stores = new Map<string, Entry>();
  private listeners = new Set<Listener>();
  private watching = false;

  constructor(backlogs: BacklogConfig[]) {
    for (const config of backlogs) {
      if (this.configured.has(config.id)) throw new Error(`duplicate backlog '${config.id}'`);
      this.configured.set(config.id, config);
    }
  }

  async scan(): Promise<void> {
    for (const config of this.configured.values()) await this.mount(config);
  }

  async add(config: BacklogConfig): Promise<BacklogSnapshot[]> {
    if (this.configured.has(config.id)) throw new Error(`backlog '${config.id}' already exists`);
    const snapshots = await this.mount(config);
    this.configured.set(config.id, config);
    return snapshots;
  }

  private async mount(config: BacklogConfig): Promise<BacklogSnapshot[]> {
    const dirs = await discoverTaskDirs(config.dir);
    if (!dirs.length) throw new Error(`no task files found under ${config.dir}`);
    const snapshots: BacklogSnapshot[] = [];
    const multiple = dirs.length > 1;
    for (const dir of dirs) {
      const suffix = multiple ? relative(config.dir, dir).replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "tasks" : "";
      const id = suffix ? `${config.id}-${suffix}` : config.id;
      if (this.stores.has(id)) continue;
      const source = { id, label: suffix ? `${config.label} · ${suffix}` : config.label, dir };
      const store = new TaskStore(dir);
      await store.scan();
      this.stores.set(id, { config: source, store });
      if (this.watching) this.attach(source, store);
      snapshots.push(this.snapshot(id)!);
    }
    return snapshots;
  }

  configuredBacklogs(): BacklogConfig[] { return [...this.configured.values()]; }

  watch(): void {
    if (this.watching) return;
    this.watching = true;
    for (const { config, store } of this.stores.values()) this.attach(config, store);
  }

  private attach(config: BacklogConfig, store: TaskStore): void {
    store.subscribe((change) => {
      const backlog = this.snapshot(config.id);
      if (!backlog) return;
      for (const listener of this.listeners) {
        try { listener(backlog, change); } catch { /* one stream cannot freeze the others */ }
      }
    });
    store.watch();
  }

  snapshot(id: string): BacklogSnapshot | undefined {
    const entry = this.stores.get(id);
    return entry && { ...entry.config, meta: entry.store.meta() };
  }

  list(): BacklogSnapshot[] {
    return [...this.stores.keys()].flatMap((id) => {
      const backlog = this.snapshot(id);
      return backlog ? [backlog] : [];
    });
  }

  get(id: string): TaskStore | undefined { return this.stores.get(id)?.store; }
  subscribe(listener: Listener): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  close(): void { for (const { store } of this.stores.values()) store.close(); }
}
