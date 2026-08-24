import { describe, expect, test } from "bun:test";
import { featureGroups } from "../public/views/features.js";

const task = (id: string, features: string[] = [], status = "open") => ({
  id, number: id, num: Number(id), title: `Task ${id}`, features, status,
  lastActivity: null,
});

describe("feature task groups", () => {
  test("keeps unlinked tasks out and allows one task in several features", () => {
    const groups = featureGroups([
      task("0001", ["app:sharing", "app:export"]),
      task("0002"),
      task("0003", ["app:sharing"], "done"),
    ]);

    expect(groups.map((group) => group.id)).toEqual(["app:export", "app:sharing"]);
    expect(groups.find((group) => group.id === "app:sharing")?.tasks.map((item: { id: string }) => item.id))
      .toEqual(["0001", "0003"]);
  });

  test("returns no groups for a feature-free legacy backlog", () => {
    expect(featureGroups([task("0001"), task("0002")])).toEqual([]);
  });
});
