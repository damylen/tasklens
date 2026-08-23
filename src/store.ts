import { watch, type FSWatcher } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { parseTask } from "./parse.ts";
import type { Meta, Rollup, Status, Task, Warning } from "./types.ts";

const TASK_FILE = /^\d{4,}[-_].*\.md$/;
const STATUSES: Status[] = ["open", "in_progress", "blocked", "done"];

export type Change =
  | { type: "upsert"; tasks: Task[] }
  | { type: "remove"; numbers: string[] }
  | { type: "reset" };

type Listener = (change: Change, meta: Meta) => void;

/**
 * Only `NNNN-*.md` at the root of the tasks directory is a task. Subdirectories
 * are deliberately not scanned or watched: in a real backlog `artifacts/` alone
 * can run to hundreds of megabytes and would swamp the watcher on its own.
 * `references/` is read lazily, on demand, from the server's reference route.
 */

/** `web/app editor` -> `["web","app","editor"]`. Slash and whitespace both separate. */
function areaTokens(part: string): string[] {
  const out: string[] = [];
  for (const chunk of part.split("/")) {
    for (const word of chunk.trim().split(/\s+/)) {
      if (word) out.push(word.toLowerCase());
    }
  }
  return out;
}

export class TaskStore {
  readonly root: string;
  /** Keyed by task id (the filename), which is unique; numbers are not. */
  private tasks = new Map<string, Task>();
  /** Task number -> every id claiming it, in filename order. */
  private numbers = new Map<string, string[]>();
  private warnings: Warning[] = [];
  private listeners = new Set<Listener>();
  private watcher: FSWatcher | null = null;
  private pending = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sweep: ReturnType<typeof setInterval> | null = null;
  private flushing = false;
  private areaFolds = 0;
  private fileFolds = 0;
  private scannedAt = 0;

  constructor(root: string) {
    this.root = root;
  }

  async scan(): Promise<void> {
    const entries = await readdir(this.root, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile() && TASK_FILE.test(e.name))
      .map((e) => e.name);

    this.tasks.clear();
    this.numbers.clear();
    this.warnings = [];

    await Promise.all(files.map((file) => this.load(file)));
    this.derive();
    this.scannedAt = Date.now();
  }

  private async load(file: string): Promise<Task | null> {
    const path = join(this.root, file);
    try {
      const [text, info] = await Promise.all([readFile(path, "utf8"), stat(path)]);
      const { task, warnings } = parseTask({
        file, path, text, mtime: info.mtimeMs, size: info.size,
      });
      this.tasks.set(task.id, task);
      this.warnings = this.warnings.filter((w) => w.file !== file).concat(warnings);
      return task;
    } catch {
      return null;
    }
  }

  /**
   * Areas drift between `/` and `-` as separators: `web-app` is the same thing
   * as `web/app`. A dashed head token is folded onto its slash form only when
   * BOTH halves independently exist as a real path elsewhere in the set, so
   * `web-app` folds while `design-system` and `ci-cd` do not.
   */
  private deriveAreas(): number {
    const raw = new Map<string, string[][]>();
    const level1 = new Set<string>();
    const children = new Map<string, Set<string>>();

    for (const task of this.tasks.values()) {
      const parts = task.areas.length ? task.areas : (task.area ? [task.area] : []);
      const paths = parts.map(areaTokens).filter((p) => p.length);
      raw.set(task.id, paths);
      for (const path of paths) {
        level1.add(path[0]!);
        if (path.length > 1) {
          let set = children.get(path[0]!);
          if (!set) children.set(path[0]!, (set = new Set()));
          set.add(path[1]!);
        }
      }
    }

    const folds = new Map<string, [string, string]>();
    for (const token of level1) {
      const dash = token.indexOf("-");
      if (dash <= 0) continue;
      const head = token.slice(0, dash);
      const tail = token.slice(dash + 1);
      if (level1.has(head) && children.get(head)?.has(tail)) folds.set(token, [head, tail]);
    }

    for (const task of this.tasks.values()) {
      const paths = raw.get(task.id) ?? [];
      const seen = new Set<string>();
      for (const path of paths) {
        const fold = folds.get(path[0]!);
        const full = fold ? [fold[0], fold[1], ...path.slice(1)] : path;
        seen.add(full.join("/"));
      }
      task.areaPaths = [...seen].sort();
    }
    return folds.size;
  }

  /**
   * The same file gets written many ways across a backlog: `Editor.vue`,
   * `web/src/components/Editor.vue`, and sometimes an
   * absolute workstation path. A short path folds onto a longer one only when
   * it is a true suffix on segment boundaries AND exactly one maximal
   * candidate exists — so `ChatMessage.vue`, which genuinely exists under two
   * unrelated trees, stays two files rather than being silently merged.
   */
  private deriveFiles(): number {
    const universe = new Set<string>();
    for (const task of this.tasks.values()) {
      for (const ref of task.fileRefs) universe.add(ref);
    }

    const segments = new Map<string, string[]>();
    for (const path of universe) segments.set(path, path.split("/"));

    // Index by basename so suffix candidates are found without an N^2 sweep.
    const byBase = new Map<string, string[]>();
    for (const path of universe) {
      const parts = segments.get(path)!;
      const base = parts[parts.length - 1]!;
      const list = byBase.get(base);
      if (list) list.push(path);
      else byBase.set(base, [path]);
    }

    const isSuffix = (short: string, long: string): boolean => {
      const a = segments.get(short)!;
      const b = segments.get(long)!;
      if (a.length >= b.length) return false;
      for (let i = 1; i <= a.length; i++) {
        if (a[a.length - i] !== b[b.length - i]) return false;
      }
      return true;
    };

    // Group every spelling of one file together, then pick the representative
    // by usefulness rather than by length: an absolute workstation path is the
    // longest but the worst name to show, so a repo-relative spelling wins.
    const parent = new Map<string, string>();
    for (const path of universe) {
      const parts = segments.get(path)!;
      const siblings = byBase.get(parts[parts.length - 1]!) ?? [];
      const longer = siblings.filter((other) => isSuffix(path, other));
      const maximal = longer.filter((a) => !longer.some((b) => isSuffix(a, b)));
      // Several unrelated trees claim this basename: keep it as its own file.
      parent.set(path, maximal.length === 1 ? maximal[0]! : path);
    }

    const rootOf = (path: string): string => {
      let current = path;
      for (let guard = 0; guard < 32; guard++) {
        const next = parent.get(current) ?? current;
        if (next === current) break;
        current = next;
      }
      return current;
    };

    const classes = new Map<string, string[]>();
    for (const path of universe) {
      const key = rootOf(path);
      const list = classes.get(key);
      if (list) list.push(path);
      else classes.set(key, [path]);
    }

    const workstationRooted = (path: string) =>
      /^(?:Users|home|root|Documents|Desktop|var|tmp|private|opt|mnt|srv|[A-Za-z]:)\//.test(path);

    const canonical = new Map<string, string>();
    let folded = 0;
    for (const members of classes.values()) {
      const best = members.slice().sort((a, b) => {
        const rooted = Number(workstationRooted(a)) - Number(workstationRooted(b));
        if (rooted) return rooted;
        const depth = segments.get(b)!.length - segments.get(a)!.length;
        if (depth) return depth;
        return a.localeCompare(b);
      })[0]!;
      for (const member of members) {
        canonical.set(member, best);
        if (member !== best) folded++;
      }
    }

    for (const task of this.tasks.values()) {
      const seen = new Set<string>();
      for (const ref of task.fileRefs) seen.add(canonical.get(ref) ?? ref);
      task.files = [...seen].sort();
    }
    return folded;
  }

  /** Every id claiming a task number, so an ambiguous reference can show all of them. */
  resolve(number: string): Task[] {
    const ids = this.numbers.get(number.padStart(4, "0")) ?? [];
    return ids.map((id) => this.tasks.get(id)).filter((t): t is Task => Boolean(t));
  }

  /** Reverse edges and parent rollups are computed, never stored in the files. */
  private derive(): void {
    this.numbers.clear();
    for (const task of this.tasks.values()) {
      const list = this.numbers.get(task.number);
      if (list) list.push(task.id);
      else this.numbers.set(task.number, [task.id]);
    }
    this.warnings = this.warnings.filter((w) => w.field !== "Number");
    for (const [number, ids] of this.numbers) {
      ids.sort();
      if (ids.length < 2) continue;
      for (const id of ids) {
        const task = this.tasks.get(id);
        if (task) task.duplicateNumber = true;
        this.warnings.push({
          file: `${id}.md`,
          field: "Number",
          value: number,
          message: `task number ${number} is claimed by ${ids.length} files`,
        });
      }
    }

    this.areaFolds = this.deriveAreas();
    this.fileFolds = this.deriveFiles();

    for (const task of this.tasks.values()) {
      task.children = [];
      task.blocks = [];
      task.rollup = null;
    }
    for (const task of this.tasks.values()) {
      if (task.parent) {
        for (const parent of this.resolve(task.parent)) parent.children.push(task.id);
      }
      for (const dep of task.dependsOn) {
        for (const blocker of this.resolve(dep)) blocker.blocks.push(task.id);
      }
      for (const sub of task.subtasks) {
        for (const child of this.resolve(sub.number)) {
          if (!child.parent && !task.children.includes(child.id)) task.children.push(child.id);
        }
      }
    }
    for (const task of this.tasks.values()) {
      task.children.sort();
      task.blocks.sort();
      const ids = new Set(task.children);
      for (const sub of task.subtasks) {
        for (const child of this.resolve(sub.number)) ids.add(child.id);
      }
      if (!ids.size) continue;

      const rollup: Rollup = { open: 0, in_progress: 0, blocked: 0, done: 0, total: 0 };
      for (const id of ids) {
        const child = this.tasks.get(id);
        if (!child) continue;
        rollup[child.status]++;
        rollup.total++;
      }
      task.rollup = rollup.total ? rollup : null;
    }
  }

  list(): Task[] {
    return [...this.tasks.values()].sort((a, b) => a.num - b.num || a.id.localeCompare(b.id));
  }

  /** Accepts an id (`0005-split-...`) or a bare number, which may be ambiguous. */
  get(key: string): Task | undefined {
    const direct = this.tasks.get(key) ?? this.tasks.get(key.replace(/\.md$/, ""));
    if (direct) return direct;
    if (/^\d{4,}$/.test(key)) return this.resolve(key)[0];
    return undefined;
  }

  meta(): Meta {
    const counts = { open: 0, in_progress: 0, blocked: 0, done: 0 } as Record<Status, number>;
    let noteCount = 0;
    for (const task of this.tasks.values()) {
      counts[task.status]++;
      noteCount += task.notes.length;
    }
    return {
      root: this.root,
      scannedAt: this.scannedAt,
      counts,
      total: this.tasks.size,
      areaFolds: this.areaFolds,
      fileFolds: this.fileFolds,
      fileCount: new Set([...this.tasks.values()].flatMap((t) => t.files)).size,
      noteCount,
      warnings: this.warnings,
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(change: Change): void {
    const meta = this.meta();
    for (const listener of this.listeners) {
      try {
        listener(change, meta);
      } catch {
        /* a failing subscriber must not stop the others */
      }
    }
  }

  /**
   * `fs.watch` is a low-latency hint, not a guarantee. On macOS it demonstrably
   * stops reporting further changes to a file after that file has been replaced
   * by a rename — which is exactly what `sed -i`, and most editors' atomic
   * save, do. A dashboard that silently goes stale is worse than one that is
   * plainly broken, so a periodic mtime sweep is the actual correctness
   * guarantee and the watcher only makes the common case feel instant.
   */
  watch(debounceMs = 90, sweepMs = 3000): void {
    if (this.watcher) return;
    if (sweepMs > 0) {
      this.sweep = setInterval(() => void this.reconcile(), sweepMs);
      this.sweep.unref?.();
    }
    this.watcher = watch(this.root, { persistent: true }, (_event, filename) => {
      if (!filename) return;
      const file = basename(filename.toString());
      if (!TASK_FILE.test(file)) return;
      this.pending.add(file);
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.flush(), debounceMs);
    });
  }

  /**
   * Compares every task file's mtime and size against what is loaded and
   * repairs anything the watcher missed. A stat-only pass over a few thousand
   * files costs a few milliseconds, so this can run often.
   */
  async reconcile(): Promise<void> {
    let entries;
    try {
      entries = await readdir(this.root, { withFileTypes: true });
    } catch {
      return;
    }
    const files = entries
      .filter((e) => e.isFile() && TASK_FILE.test(e.name))
      .map((e) => e.name);

    const present = new Set<string>();
    const stale: string[] = [];

    await Promise.all(files.map(async (file) => {
      const id = file.replace(/\.md$/, "");
      present.add(id);
      const known = this.tasks.get(id);
      try {
        const info = await stat(join(this.root, file));
        if (!known || known.mtime !== info.mtimeMs || known.size !== info.size) stale.push(file);
      } catch {
        /* vanished mid-sweep; the next pass will settle it */
      }
    }));

    const gone = [...this.tasks.keys()].filter((id) => !present.has(id));
    if (!stale.length && !gone.length) return;

    for (const file of stale) this.pending.add(file);
    for (const id of gone) this.pending.add(`${id}.md`);
    await this.flush();
  }

  private async flush(): Promise<void> {
    // A sweep and a watcher burst can land together; the loser's files stay in
    // `pending` and the next pass picks them up.
    if (this.flushing) return;
    this.flushing = true;
    try {
      await this.doFlush();
    } finally {
      this.flushing = false;
    }
  }

  private async doFlush(): Promise<void> {
    const files = [...this.pending];
    this.pending.clear();
    this.timer = null;

    const upserts: Task[] = [];
    const removed: string[] = [];

    for (const file of files) {
      const id = file.replace(/\.md$/, "");
      const existed = this.tasks.has(id);
      const task = await this.load(file);
      if (task) {
        upserts.push(task);
      } else if (existed) {
        this.tasks.delete(id);
        this.warnings = this.warnings.filter((w) => w.file !== file);
        removed.push(id);
      }
    }

    if (!upserts.length && !removed.length) return;

    // Relations are global: one file changing can alter another's rollup.
    this.derive();
    if (removed.length) this.emit({ type: "remove", numbers: removed });
    if (upserts.length) {
      // A file changing can alter a neighbour's rollup or reverse edges, so
      // ship the whole neighbourhood rather than just the edited file.
      const touched = new Set<string>();
      for (const task of upserts) {
        touched.add(task.id);
        for (const id of task.children) touched.add(id);
        for (const id of task.blocks) touched.add(id);
        for (const number of [task.parent, ...task.dependsOn, ...task.subtasks.map((s) => s.number)]) {
          if (!number) continue;
          for (const related of this.resolve(number)) touched.add(related.id);
        }
      }
      const payload: Task[] = [];
      for (const id of touched) {
        const task = this.tasks.get(id);
        if (task) payload.push(task);
      }
      this.emit({ type: "upsert", tasks: payload });
    }
  }

  close(): void {
    this.watcher?.close();
    this.watcher = null;
    if (this.sweep) clearInterval(this.sweep);
    this.sweep = null;
    if (this.timer) clearTimeout(this.timer);
  }
}

export { STATUSES };
