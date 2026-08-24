import { afterEach, expect, test } from "bun:test";
import { confirmRemoveChange } from "../public/views/changes.js";

const originalConfirm = globalThis.confirm;
afterEach(() => { globalThis.confirm = originalConfirm; });

test("candidate removal requires confirmation before touching its source", async () => {
  const removed: unknown[] = [];
  const change = { id: "drop-me", source: "release-notes/unreleased.yaml" };
  const ctx = {
    rerender() {},
    store: { async removeChange(candidate: unknown) { removed.push(candidate); } },
  };
  globalThis.confirm = () => false;
  await confirmRemoveChange(change, ctx);
  expect(removed).toEqual([]);

  globalThis.confirm = () => true;
  await confirmRemoveChange(change, ctx);
  expect(removed).toEqual([change]);
});
