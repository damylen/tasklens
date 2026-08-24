import { expect, test } from "bun:test";
import "../public/views/index.js";
import { allViews, defaultViewId, getView } from "../public/lib/registry.js";

test("timeline leads project navigation and is the default project view", () => {
  expect(allViews().slice(0, 2).map((view) => view.id)).toEqual(["timeline", "kanban"]);
  expect(defaultViewId()).toBe("timeline");
  expect(getView("timeline")?.id).toBe("timeline");
  expect(getView("kanban")?.id).toBe("kanban");
});
