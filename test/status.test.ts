import { describe, expect, test } from "bun:test";
import { isOperationalStatus } from "../public/lib/status.js";

describe("operational status", () => {
  // Ideas must remain visible in planning views without contributing to the
  // collision and blocker signals that tell people to take action now.
  test("excludes wishlist and done work from operational signals", () => {
    expect(isOperationalStatus("wishlist")).toBe(false);
    expect(isOperationalStatus("done")).toBe(false);
    expect(isOperationalStatus("open")).toBe(true);
    expect(isOperationalStatus("in_progress")).toBe(true);
    expect(isOperationalStatus("blocked")).toBe(true);
  });
});
