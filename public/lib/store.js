/**
 * Client-side mirror of the server store. Fetches the full set once, then
 * patches it from SSE deltas. Every SSE open — including an automatic
 * reconnect — triggers a refetch, so a stream that missed a delta resyncs
 * instead of drifting.
 */
export class ClientStore {
  constructor() {
    this.tasks = new Map();
    this.meta = null;
    this.connected = false;
    this.fresh = new Set();
    this.listeners = new Set();
    this.source = null;
    this.freshTimer = null;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(reason) {
    for (const fn of this.listeners) fn(reason);
  }

  list() {
    return [...this.tasks.values()].sort((a, b) => a.num - b.num || a.id.localeCompare(b.id));
  }

  /** Accepts an id, or a bare number when it is unambiguous. */
  get(key) {
    const direct = this.tasks.get(key);
    if (direct) return direct;
    if (/^\d{4,}$/.test(key)) return this.resolve(key)[0];
    return undefined;
  }

  /** Every task claiming a number — more than one when agents collided. */
  resolve(number) {
    const padded = String(number).padStart(4, "0");
    return this.list().filter((t) => t.number === padded);
  }

  /** Every note across every task, newest first, carrying its task. */
  notes() {
    const out = [];
    for (const task of this.tasks.values()) {
      for (const note of task.notes) out.push({ ...note, task });
    }
    out.sort((a, b) => (a.date === b.date ? b.task.mtime - a.task.mtime : b.date.localeCompare(a.date)));
    return out;
  }

  async load() {
    const response = await fetch("/api/tasks");
    if (!response.ok) throw new Error(`tasks request failed: ${response.status}`);
    const data = await response.json();
    this.tasks = new Map(data.tasks.map((t) => [t.id, t]));
    this.meta = data.meta;
    this.emit("load");
  }

  connect() {
    if (this.source) return;
    const source = new EventSource("/api/events");
    this.source = source;

    source.addEventListener("open", () => {
      this.connected = true;
      this.load().catch(() => {});
      this.emit("connect");
    });

    source.addEventListener("error", () => {
      // EventSource retries on its own; reflect the gap in the chrome meanwhile.
      if (this.connected) {
        this.connected = false;
        this.emit("disconnect");
      }
    });

    source.addEventListener("change", (event) => {
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      const { change, meta } = payload;
      if (meta) this.meta = meta;

      if (change.type === "upsert") {
        for (const task of change.tasks) {
          this.tasks.set(task.id, task);
          this.fresh.add(task.id);
        }
      } else if (change.type === "remove") {
        for (const id of change.numbers) {
          this.tasks.delete(id);
          this.fresh.delete(id);
        }
      }
      this.scheduleFade();
      this.emit("change");
    });
  }

  /** The amber "just changed" mark decays so the board settles on its own. */
  scheduleFade() {
    clearTimeout(this.freshTimer);
    this.freshTimer = setTimeout(() => {
      this.fresh.clear();
      this.emit("fade");
    }, 20000);
  }

  isFresh(id) {
    return this.fresh.has(id);
  }
}
