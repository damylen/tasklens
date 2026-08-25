import { describe, expect, test } from "bun:test";
import { createStore } from "../public/lib/persist.js";

/** Stand-in for localStorage, with a switch to make it fail like a real one. */
function fakeStorage({ failOn = "" } = {}) {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    removeItem: (k: string) => { map.delete(k); },
    setItem: (k: string, v: string) => {
      if (failOn === "always" || (failOn === "write" && !k.includes("probe"))) {
        throw new Error("QuotaExceededError");
      }
      map.set(k, v);
    },
    _map: map,
  };
}

describe("persisted view state", () => {
  test("round-trips a value", () => {
    const store = createStore("/work/repo", fakeStorage());
    store.write("kanban", { collapsed: ["done"] });
    expect(store.read("kanban", null)).toEqual({ collapsed: ["done"] });
  });

  // tasklens is meant to run in several folders at once. Sharing one key would
  // make collapsing a column in one project silently collapse it in another.
  test("two backlogs do not share state", () => {
    const backing = fakeStorage();
    const a = createStore("/work/alpha", backing);
    const b = createStore("/work/beta", backing);

    a.write("kanban", { collapsed: ["done"] });
    b.write("kanban", { collapsed: ["open"] });

    expect(a.read("kanban", null)).toEqual({ collapsed: ["done"] });
    expect(b.read("kanban", null)).toEqual({ collapsed: ["open"] });
  });

  // Private browsing and disabled-storage origins throw on first touch. The
  // board still has to render, so the store degrades instead of exploding.
  test("falls back to memory when storage is refused outright", () => {
    const store = createStore("/work/repo", fakeStorage({ failOn: "always" }));
    expect(store.durable).toBe(false);
    store.write("kanban", { collapsed: ["blocked"] });
    expect(store.read("kanban", null)).toEqual({ collapsed: ["blocked"] });
  });

  // Quota can be exhausted after the probe succeeded, mid-session.
  test("keeps the value for this page when a write is rejected later", () => {
    const store = createStore("/work/repo", fakeStorage({ failOn: "write" }));
    expect(store.durable).toBe(true);
    store.write("kanban", { collapsed: ["open"] });
    expect(store.read("kanban", null)).toEqual({ collapsed: ["open"] });
  });

  test("returns the fallback for an unreadable value rather than throwing", () => {
    const backing = fakeStorage();
    const store = createStore("/work/repo", backing);
    backing._map.set("tasklens:/work/repo:kanban", "{ not json");
    expect(store.read("kanban", "fallback")).toBe("fallback");
  });

  test("returns the fallback when nothing was ever written", () => {
    const store = createStore("/work/repo", fakeStorage());
    expect(store.read("missing", "fallback")).toBe("fallback");
  });
});

test("timeline collapse state stays scoped to its project", () => {
  const backing = fakeStorage();
  const alpha = createStore("/work/alpha/TASKS", backing);
  const beta = createStore("/work/beta/TASKS", backing);

  alpha.write("timeline.collapsed", ["2026-08-24:0001-a"]);

  expect(alpha.read("timeline.collapsed", [])).toEqual(["2026-08-24:0001-a"]);
  expect(beta.read("timeline.collapsed", [])).toEqual([]);
});
