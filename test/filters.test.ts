import { describe, expect, test } from "bun:test";
import { normalizePriorities, priorityMatches, togglePriority } from "../public/lib/filters.js";

describe("priority multi-select", () => {
  test("toggles independent priorities in stable display order", () => {
    expect(togglePriority([], "high")).toEqual(["high"]);
    expect(togglePriority(["high"], "critical")).toEqual(["critical", "high"]);
    expect(togglePriority(["critical", "high"], "high")).toEqual(["critical"]);
    expect(togglePriority(["critical"], "all")).toEqual([]);
  });

  test("matches any selected priority and treats empty as all", () => {
    expect(priorityMatches("medium", [])).toBe(true);
    expect(priorityMatches("medium", ["high", "medium"])).toBe(true);
    expect(priorityMatches("low", ["high", "medium"])).toBe(false);
  });

  test("normalizes persisted and legacy values", () => {
    expect(normalizePriorities(["low", "unknown", "critical"])).toEqual(["critical", "low"]);
    expect(normalizePriorities("high")).toEqual(["high"]);
    expect(normalizePriorities("all")).toEqual([]);
  });
});
