import { afterEach, expect, test } from "bun:test";
import { ClientStore } from "../public/lib/store.js";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("removing a candidate addresses its exact source and refreshes the active backlog", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    return Response.json({ backlogs: [{
      id: "alpha",
      label: "Alpha",
      dir: "/work/alpha/TASKS",
      meta: { total: 1 },
      changes: [{ id: "keep-me", source: "release-notes/unreleased.yaml" }],
      changeWarnings: [],
      tasks: [{ id: "0001-task", number: "0001", num: 1 }],
    }] });
  }) as typeof fetch;
  const store = new ClientStore();
  store.activeBacklog = "alpha";
  store.backlogs.set("alpha", {
    id: "alpha",
    changes: [
      { id: "remove-me", source: "packages/web/release-notes/unreleased.yaml" },
      { id: "keep-me", source: "release-notes/unreleased.yaml" },
    ],
    tasks: new Map(),
  });

  await store.removeChange({ id: "remove-me", source: "packages/web/release-notes/unreleased.yaml" });

  expect(requests[0]?.url).toBe("/api/backlogs/alpha/changes");
  expect(requests[0]?.init?.method).toBe("DELETE");
  expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
    source: "packages/web/release-notes/unreleased.yaml",
    id: "remove-me",
  });
  expect(store.backlogs.get("alpha")?.changes.map((change: { id: string }) => change.id)).toEqual(["keep-me"]);
  expect(store.get("0001")?.id).toBe("0001-task");
});

test("global task consumers see work outside the selected backlog", () => {
  const store = new ClientStore();
  store.backlogs.set("quiet", {
    id: "quiet",
    tasks: new Map([["0001-done", { id: "0001-done", num: 1, status: "done" }]]),
  });
  store.backlogs.set("active", {
    id: "active",
    tasks: new Map([["0002-running", { id: "0002-running", num: 2, status: "in_progress" }]]),
  });
  store.select("quiet", false);

  expect(store.list().map((task) => task.id)).toEqual(["0001-done"]);
  expect(store.listAll().map((task) => task.id)).toEqual(["0001-done", "0002-running"]);
});
