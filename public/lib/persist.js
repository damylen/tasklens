/**
 * Small namespaced wrapper over localStorage.
 *
 * Two things it guarantees, both of which matter here:
 *  - State is scoped to the backlog being served, because tasklens is meant to
 *    run in several folders at once and two projects must not share settings.
 *  - Storage failure is never fatal. Private browsing, a full quota or a
 *    disabled origin all throw on access; the board has to render anyway, so
 *    the store falls back to memory and the page keeps working.
 */
const PREFIX = "tasklens";

function probe(candidate) {
  try {
    const key = `${PREFIX}:probe`;
    candidate.setItem(key, "1");
    candidate.removeItem(key);
    return candidate;
  } catch {
    return null;
  }
}

export function createStore(namespace, backing) {
  const memory = new Map();
  const store = backing === undefined
    ? probe(typeof localStorage === "undefined" ? null : localStorage)
    : probe(backing);

  const scope = `${PREFIX}:${namespace || "default"}`;
  const full = (key) => `${scope}:${key}`;

  return {
    /** True when values actually outlive the page. */
    get durable() {
      return store !== null;
    },

    read(key, fallback) {
      try {
        // Memory holds whatever this session last wrote, including a value a
        // rejected write could not hand to storage, so it wins over storage.
        const raw = memory.has(full(key))
          ? memory.get(full(key))
          : (store ? store.getItem(full(key)) : null);
        if (raw == null) return fallback;
        return JSON.parse(raw);
      } catch {
        // A value written by an older version can be unparseable; treat it as
        // absent rather than breaking the view that reads it.
        return fallback;
      }
    },

    write(key, value) {
      const raw = JSON.stringify(value);
      memory.set(full(key), raw);
      try {
        if (store) store.setItem(full(key), raw);
      } catch {
        // Quota exceeded mid-session: the memory copy above still carries the
        // value for this page, it just will not survive a reload.
      }
    },
  };
}
