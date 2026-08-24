import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discoverReleaseCandidates, parseReleaseCandidates, removeReleaseCandidate } from "../src/releases.ts";

describe("release candidates", () => {
  test("reads the existing CS schema and optional future feature links", () => {
    const changes = parseReleaseCandidates(`
schemaVersion: 1
changes:
  - id: custom-basemap-source
    date: 2026-08-23
    type: feature
    summary: Added custom base maps.
    details: Users can add one from a URL.
    tasks: [42]
    features: [osmentis:map-basemaps]
`, "client/v2/release-notes/unreleased.yaml");

    expect(changes).toEqual([{
      id: "custom-basemap-source",
      date: "2026-08-23",
      type: "feature",
      summary: "Added custom base maps.",
      details: "Users can add one from a URL.",
      tasks: ["0042"],
      features: ["osmentis:map-basemaps"],
      source: "client/v2/release-notes/unreleased.yaml",
    }]);
  });

  test("keeps candidates valid without features", () => {
    const [change] = parseReleaseCandidates(`schemaVersion: 1\nchanges:\n  - id: small-fix\n    date: 2026-08-23\n    type: fix\n    summary: Fixed it.\n    tasks: [7]\n`, "release-notes/unreleased.yaml");
    expect(change?.features).toEqual([]);
    expect(change?.tasks).toEqual(["0007"]);
  });

  test("discovers source-owned candidates below a configured project", async () => {
    const root = await mkdtemp(join(tmpdir(), "tasklens-releases-"));
    const source = join(root, "packages", "web", "release-notes");
    await mkdir(source, { recursive: true });
    await writeFile(join(source, "unreleased.yaml"), `schemaVersion: 1\nchanges:\n  - id: web-change\n    date: 2026-08-23\n    type: improvement\n    summary: Improved the web app.\n    tasks: [12]\n`);

    const result = await discoverReleaseCandidates(root);
    expect(result.warnings).toEqual([]);
    expect(result.changes[0]?.source).toBe("packages/web/release-notes/unreleased.yaml");
    expect(result.changes[0]?.tasks).toEqual(["0012"]);
  });

  test("removes only the selected source block and preserves the remaining text", async () => {
    const root = await mkdtemp(join(tmpdir(), "tasklens-remove-release-"));
    const dir = join(root, "release-notes");
    const file = join(dir, "unreleased.yaml");
    await mkdir(dir, { recursive: true });
    await writeFile(file, `schemaVersion: 1

changes:
  - id: remove-me
    date: 2026-08-23
    type: feature
    summary: Remove this candidate.
    tasks: [4]

  # Keep this comment with the remaining candidate.
  - id: keep-me
    date: 2026-08-23
    type: fix
    summary: Keep this candidate.
    tasks: [5]
`);

    await removeReleaseCandidate(root, "release-notes/unreleased.yaml", "remove-me");

    const text = await readFile(file, "utf8");
    expect(text).not.toContain("remove-me");
    expect(text).toContain("# Keep this comment with the remaining candidate.");
    expect(parseReleaseCandidates(text, "release-notes/unreleased.yaml").map((change) => change.id)).toEqual(["keep-me"]);
  });

  test("refuses an unsafe source without rewriting either file", async () => {
    const root = await mkdtemp(join(tmpdir(), "tasklens-safe-release-"));
    const outside = join(root, "..", `outside-${Date.now()}.yaml`);
    await writeFile(outside, "do not touch\n");

    await expect(removeReleaseCandidate(root, `../${outside.split("/").at(-1)}`, "anything"))
      .rejects.toThrow("outside the configured project");
    expect(await readFile(outside, "utf8")).toBe("do not touch\n");
  });

  test("refuses malformed release notes without rewriting them", async () => {
    const root = await mkdtemp(join(tmpdir(), "tasklens-malformed-release-"));
    const dir = join(root, "release-notes");
    const file = join(dir, "unreleased.yaml");
    const malformed = "changes:\n  - id: broken\n    summary: Missing schema version.\n";
    await mkdir(dir, { recursive: true });
    await writeFile(file, malformed);

    await expect(removeReleaseCandidate(root, "release-notes/unreleased.yaml", "broken"))
      .rejects.toThrow("expected schemaVersion 1");
    expect(await readFile(file, "utf8")).toBe(malformed);
  });
});
