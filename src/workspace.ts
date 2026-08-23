import type { Change } from "./store.ts";
import { TaskStore } from "./store.ts";
import type { BacklogConfig } from "./config.ts";
import type { Meta } from "./types.ts";

export interface BacklogSnapshot extends BacklogConfig {
  meta: Meta;
}

type Listener = (backlog: BacklogSnapshot, change: Change) => void;

/** A live workspace coordinates isolated task graphs without ever merging them. */
export class WorkspaceStore {
  private stores = new Map<string, { config: BacklogConfig; store: TaskStore }>();
  private listeners = new Set<Listener>();
  private watching = false;

  constructor(backlogs: BacklogConfig[]) {
    for (const config of backlogs) {
      if (this.stores.has(config.id)) throw new Error(`duplicate backlog '${config.id}'`);
      this.stores.set(config.id, { config, store: new TaskStore(config.dir) });
    }
  }

  async scan(): Promise<void> {
    await Promise.all([...this.stores.values()].map(async ({ store }) => store.scan()));
  }

  /** Scan before publishing the new source, so an unreadable directory never becomes a half-backlog. */
  async add(config: BacklogConfig): Promise<BacklogSnapshot> {
    if (this.stores.has(config.id)) throw new Error(`backlog '${config.id}' already exists`);
    const store = new TaskStore(config.dir);
    await store.scan();
    this.stores.set(config.id, { config, store });
    if (this.watching) this.attach(config, store);
    return this.snapshot(config.id)!;
  }

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

  get(id: string): TaskStore | undefined {
    return this.stores.get(id)?.store;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    for (const { store } of this.stores.values()) store.close();
  }
}
