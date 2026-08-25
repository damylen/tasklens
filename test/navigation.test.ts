import { expect, test } from "bun:test";

test("TaskLens brand owns Overview navigation instead of the project dropdown", async () => {
  // If Overview returns to the selector, project navigation mixes a location
  // with project identity; if the brand stops being a button, Home loses its
  // accessible primary entry point.
  const source = await Bun.file(new URL("../public/app.js", import.meta.url)).text();
  expect(source).toContain('button.brand');
  expect(source).toContain('onclick: () => openOverview(false)');
  expect(source).not.toContain('value: "overview"');
  expect(source).not.toContain('}, "Overview")');
});
