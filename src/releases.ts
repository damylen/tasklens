import { randomUUID } from "node:crypto";
import { readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import type { ChangeCandidate } from "./types.ts";

const SKIP_DIRS = new Set([
  ".git", ".hg", ".svn", ".venv", "node_modules", "dist", "build",
  "coverage", ".next", "target",
]);

function projectRoot(configuredRoot: string): string {
  return /^tasks$/i.test(basename(configuredRoot)) ? dirname(configuredRoot) : configuredRoot;
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
}

function tasks(value: unknown): string[] {
  return strings(value).map((item) => item.match(/\d+/)?.[0]?.padStart(4, "0") ?? item);
}

export function parseReleaseCandidates(text: string, source: string): ChangeCandidate[] {
  if (!/^schemaVersion:\s*1\s*$/m.test(text) || !/^changes:\s*$/m.test(text)) {
    throw new Error("expected schemaVersion 1 with a changes list");
  }

  const unquote = (value: string): string => {
    const trimmed = value.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  };
  const inlineList = (value: string): string[] => {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
      throw new Error("tasks and features must use an inline YAML list");
    }
    return trimmed.slice(1, -1).split(",").map(unquote).filter(Boolean);
  };

  const records: Array<Record<string, string>> = [];
  let current: Record<string, string> | null = null;
  for (const line of text.split("\n")) {
    const start = line.match(/^\s*-\s+id:\s*(.*)$/);
    if (start) {
      if (current) records.push(current);
      current = { id: unquote(start[1] ?? "") };
      continue;
    }
    if (!current) continue;
    const field = line.match(/^\s{4,}([A-Za-z][A-Za-z]*):\s*(.*)$/);
    if (field?.[1]) current[field[1]] = unquote(field[2] ?? "");
  }
  if (current) records.push(current);

  return records.map((change, index) => {
    const id = change.id?.trim() ?? "";
    const summary = change.summary?.trim() ?? "";
    if (!id || !summary) throw new Error(`change ${index + 1} needs id and summary`);
    return {
      id,
      date: change.date?.trim() ?? "",
      type: change.type?.trim() || "change",
      summary,
      details: change.details?.trim() ?? "",
      tasks: tasks(inlineList(change.tasks ?? "")),
      features: strings(inlineList(change.features ?? "")),
      source,
    };
  });
}

export async function discoverReleaseCandidates(configuredRoot: string): Promise<{
  changes: ChangeCandidate[];
  warnings: string[];
}> {
  const root = projectRoot(configuredRoot);
  const queue = [resolve(root)];
  const files: string[] = [];

  for (let cursor = 0; cursor < queue.length; cursor++) {
    const dir = queue[cursor]!;
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { continue; }
    if (basename(dir) === "release-notes") {
      const candidate = entries.find((entry) => entry.isFile() && entry.name === "unreleased.yaml");
      if (candidate) files.push(resolve(dir, candidate.name));
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) queue.push(resolve(dir, entry.name));
    }
  }

  const changes: ChangeCandidate[] = [];
  const warnings: string[] = [];
  for (const file of files.sort()) {
    const source = relative(root, file);
    try {
      changes.push(...parseReleaseCandidates(await readFile(file, "utf8"), source));
    } catch (error) {
      warnings.push(`${source}: ${(error as Error).message}`);
    }
  }
  return { changes, warnings };
}

/** Remove one source-local candidate without reserializing the rest of the YAML file. */
export async function removeReleaseCandidate(configuredRoot: string, source: string, id: string): Promise<void> {
  const root = resolve(projectRoot(configuredRoot));
  const cleaned = normalize(source.trim());
  const full = resolve(root, cleaned);
  if (!cleaned || isAbsolute(cleaned) || (full !== root && !full.startsWith(root + sep))) {
    throw new Error("candidate source is outside the configured project");
  }
  if (basename(full) !== "unreleased.yaml" || basename(dirname(full)) !== "release-notes") {
    throw new Error("candidate source must be a release-notes/unreleased.yaml file");
  }

  const text = await readFile(full, "utf8");
  // Refuse to mutate a malformed file even when its target block looks recognizable.
  parseReleaseCandidates(text, source);

  const unquote = (value: string): string => {
    const trimmed = value.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  };
  const lines = text.match(/.*(?:\r?\n|$)/g)?.filter(Boolean) ?? [];
  const starts = lines.flatMap((line, index) => {
    const match = line.match(/^\s*-\s+id:\s*(.*?)(?:\r?\n)?$/);
    return match ? [{ index, id: unquote(match[1] ?? "") }] : [];
  });
  const matches = starts.filter((candidate) => candidate.id === id);
  if (!matches.length) throw new Error(`candidate '${id}' not found in ${source}`);
  if (matches.length > 1) throw new Error(`candidate '${id}' is ambiguous in ${source}`);

  const start = matches[0]!.index;
  const next = starts.find((candidate) => candidate.index > start)?.index ?? lines.length;
  // Blank lines and comments immediately before the next candidate belong to
  // that remaining context, not to the candidate being removed.
  let end = next;
  while (end > start + 1 && /^(?:\s*|\s*#.*)(?:\r?\n)?$/.test(lines[end - 1]!)) end--;
  const output = [...lines.slice(0, start), ...lines.slice(end)].join("");

  const info = await stat(full);
  const temporary = join(dirname(full), `.unreleased.yaml.tasklens-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, output, { mode: info.mode });
    await rename(temporary, full);
  } finally {
    await rm(temporary, { force: true });
  }
}
