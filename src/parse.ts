import type {
  Note, Priority, Reference, Status, Subtask, Task, Warning,
} from "./types.ts";

/**
 * Status vocabulary observed in real backlogs. Values outside this map are not
 * guessed at: they fall back to `open` and raise a warning, and the raw string
 * is always kept on the task so nothing is silently rewritten.
 */
const STATUS_WORDS: Record<string, Status> = {
  wishlist: "wishlist",
  idea: "wishlist",
  someday: "wishlist",
  someday_maybe: "wishlist",
  "someday-maybe": "wishlist",

  done: "done",
  completed: "done",
  complete: "done",
  implemented: "done",
  closed: "done",
  finished: "done",

  in_progress: "in_progress",
  "in-progress": "in_progress",
  inprogress: "in_progress",
  wip: "in_progress",
  started: "in_progress",
  review: "in_progress",
  "in-review": "in_progress",
  "design-review": "in_progress",
  pending: "in_progress",

  open: "open",
  new: "open",
  todo: "open",
  planned: "open",
  proposed: "open",
  backlog: "open",

  blocked: "blocked",
  on_hold: "blocked",
  "on-hold": "blocked",
  hold: "blocked",
  waiting: "blocked",
};

const PRIORITY_WORDS: Record<string, Priority> = {
  critical: "critical",
  urgent: "critical",
  p0: "critical",
  high: "high",
  p1: "high",
  medium: "medium",
  normal: "medium",
  p2: "medium",
  low: "low",
  p3: "low",
};

/** Exact match, then first token, then any token. */
function foldWord<T>(raw: string, table: Record<string, T>): T | null {
  const value = raw.trim().toLowerCase();
  if (!value) return null;

  const exact = table[value];
  if (exact) return exact;

  const tokens = value.split(/[^a-z0-9_-]+/).filter(Boolean);
  const first = tokens[0];
  if (first && table[first]) return table[first]!;

  for (const token of tokens) {
    const hit = table[token];
    if (hit) return hit;
  }
  return null;
}

/** `0106`, `1734-transit-discovery`, `1949-rehost.md` all yield `1734`-style ids. */
function taskNumbers(raw: string): string[] {
  const value = raw.trim();
  if (!value || /^none$/i.test(value)) return [];
  const out: string[] = [];
  for (const part of value.split(",")) {
    const match = part.trim().match(/(\d{4,})/);
    if (match?.[1]) out.push(match[1].padStart(4, "0"));
  }
  return out;
}

function parseReferences(raw: string): Reference[] {
  const value = raw.trim();
  if (!value || /^none$/i.test(value)) return [];

  // Split on commas that sit outside a markdown link — a comma can appear in
  // both halves, `[a, b](x)`, so both bracket kinds have to be tracked.
  const parts: string[] = [];
  let round = 0;
  let square = 0;
  let buf = "";
  for (const ch of value) {
    if (ch === "(") round++;
    else if (ch === ")") round = Math.max(0, round - 1);
    else if (ch === "[") square++;
    else if (ch === "]") square = Math.max(0, square - 1);

    if (ch === "," && round === 0 && square === 0) {
      parts.push(buf);
      buf = "";
    } else buf += ch;
  }
  parts.push(buf);

  const out: Reference[] = [];
  for (const part of parts) {
    const item = part.trim();
    if (!item) continue;
    const link = item.match(/^\[([^\]]*)\]\(([^)]+)\)$/);
    if (link?.[2]) {
      const target = link[2].trim();
      out.push({
        label: (link[1] || target).trim(),
        target,
        kind: /^https?:\/\//i.test(target) ? "url" : "path",
      });
      continue;
    }
    out.push({
      label: item,
      target: item,
      kind: /^https?:\/\//i.test(item) ? "url" : "path",
    });
  }
  return out;
}

function parseSubtasks(body: string): Subtask[] {
  const out: Subtask[] = [];
  for (const line of body.split("\n")) {
    const match = line.match(/^\s*[-*]\s*(?:\[([ xX])\]\s*)?(\d{4,})\b[-\s]*(.*)$/);
    if (!match?.[2]) continue;
    const box = match[1];
    out.push({
      number: match[2].padStart(4, "0"),
      title: (match[3] || "").replace(/\.md$/, "").replace(/^[-\s]+/, "").trim(),
      checked: box === undefined ? null : box.toLowerCase() === "x",
    });
  }
  return out;
}

/**
 * File extensions worth indexing. Deliberately a closed list: matching any
 * dotted token would pull in version numbers (`0.7.8`) and library names
 * (`Three.js` is prose, not a file).
 */
const FILE_EXT = "js|mjs|cjs|jsx|ts|tsx|mts|cts|py|pyi|vue|svelte|html|htm" +
  "|css|scss|sass|less|json|yaml|yml|toml|ini|cfg|conf|sh|bash|sql|env";

/**
 * Only backticked spans and markdown link targets count. Bare prose mentions
 * are too noisy to index — measured against a real backlog, matching bare text
 * produced library names far more often than filenames.
 */
const FILE_PATTERNS = [
  new RegExp("`([^`\\s]{2,120}\\.(?:" + FILE_EXT + "))`", "g"),
  new RegExp("\\]\\(([^)\\s]{2,120}\\.(?:" + FILE_EXT + "))\\)", "g"),
  /`(\.env(?:\.[a-z0-9]+)?)`/g,
];

/** Strip the ways the same path gets written: URLs, absolute roots, `$VAR/`, `../`. */
function normalizeFilePath(raw: string): string | null {
  let value = raw.trim();
  value = value.replace(/^file:\/\/+/i, "");
  value = value.replace(/^[~$][A-Za-z_{}]*\//, "");
  value = value.replace(/^(?:\.\.\/)+/, "");
  value = value.replace(/^\.\//, "");
  value = value.replace(/^\/+/, "");
  value = value.replace(/[),.;:]+$/, "");
  if (!value || value.includes("*")) return null;
  // Task cross-references are relations, not source files; they already have
  // their own edges through Parent and Depends on.
  if (/^TASKS\//i.test(value) || /\.md$/i.test(value)) return null;
  if (value.length > 160) return null;
  return value;
}

function parseFileRefs(text: string): string[] {
  const out = new Set<string>();
  for (const pattern of FILE_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const value = normalizeFilePath(match[1] ?? "");
      if (value) out.add(value);
    }
  }
  return [...out].sort();
}

const NOTE_START = /^\s*[-*]\s+(\d{4}-\d{2}-\d{2})(.*)$/;

/**
 * Agent Notes entries. Handles the four shapes seen in the wild:
 *   - 2026-02-14: text
 *   - 2026-02-14 Alice: text
 *   - 2026-02-14 (Bruno): text
 *   - 2026-02-14 reviewed with the team     (no colon at all)
 * Indented follow-on lines are appended to the entry above rather than dropped.
 */
function parseNotes(body: string, offset: number): Note[] {
  const out: Note[] = [];
  const lines = body.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const match = line.match(NOTE_START);
    if (!match?.[1]) continue;

    const rest = match[2] ?? "";
    let agent: string | null = null;
    let text = "";

    const colon = rest.match(/^\s*:\s*(.*)$/);
    const paren = rest.match(/^\s*\(([^)]+)\)\s*:\s*(.*)$/);
    const named = rest.match(/^\s+([^:.]{1,40}?)\s*:\s*(.*)$/);

    if (colon) {
      text = colon[1] ?? "";
    } else if (paren) {
      agent = (paren[1] ?? "").trim();
      text = paren[2] ?? "";
    } else if (named) {
      agent = (named[1] ?? "").trim();
      text = named[2] ?? "";
    } else {
      text = rest.trim();
    }

    // Absorb indented continuation lines.
    const parts = [text.trim()];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const next = lines[j] ?? "";
      if (NOTE_START.test(next)) break;
      if (!next.trim()) {
        // A blank line only continues if an indented line follows.
        const after = lines[j + 1] ?? "";
        if (NOTE_START.test(after) || !/^\s+\S/.test(after)) break;
        continue;
      }
      if (!/^\s+\S/.test(next)) break;
      parts.push(next.trim());
    }
    i = j - 1;

    out.push({
      date: match[1],
      agent,
      text: parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim(),
      line: offset + i + 1,
    });
  }
  return out;
}

export interface ParseInput {
  file: string;
  path: string;
  text: string;
  mtime: number;
  size: number;
}

export interface ParseResult {
  task: Task;
  warnings: Warning[];
}

export function parseTask(input: ParseInput): ParseResult {
  const { file, path, text, mtime, size } = input;
  const warnings: Warning[] = [];
  const lines = text.split("\n");

  const fileNumber = file.match(/^(\d{4,})/)?.[1] ?? null;

  // ── title ────────────────────────────────────────────────
  let title = "";
  let number = fileNumber;
  const headingIndex = lines.findIndex((l) => /^#\s+/.test(l));
  if (headingIndex >= 0) {
    const heading = (lines[headingIndex] ?? "").replace(/^#\s+/, "").trim();
    const withNumber = heading.match(/^(\d{4,})\s+(.*)$/);
    if (withNumber?.[1]) {
      number = number ?? withNumber[1];
      title = (withNumber[2] ?? "").trim();
    } else {
      title = heading;
    }
  }
  if (!title) {
    title = file
      .replace(/^\d{4,}[-_]?/, "")
      .replace(/\.md$/, "")
      .replace(/[-_]+/g, " ")
      .trim();
  }
  if (!number) number = "0000";
  number = number.padStart(4, "0");

  // ── header fields: after the H1, before the first H2 ─────
  const fields: Record<string, string> = {};
  const bodyStart = lines.findIndex((l) => /^##\s+/.test(l));
  const headerEnd = bodyStart === -1 ? lines.length : bodyStart;
  for (let i = headingIndex + 1; i < headerEnd; i++) {
    const line = lines[i] ?? "";
    if (/^\s*$/.test(line)) continue;
    const match = line.match(/^([A-Za-z][A-Za-z ]*?):\s*(.*)$/);
    if (!match?.[1]) continue;
    fields[match[1].trim().toLowerCase().replace(/\s+/g, "")] = (match[2] ?? "").trim();
  }

  // ── H2 sections ──────────────────────────────────────────
  const sections: Record<string, string> = {};
  const sectionOrder: string[] = [];
  const sectionLine: Record<string, number> = {};
  if (bodyStart !== -1) {
    let current: string | null = null;
    let buf: string[] = [];
    const flush = () => {
      if (current !== null) sections[current] = buf.join("\n").trim();
    };
    for (let i = bodyStart; i < lines.length; i++) {
      const line = lines[i] ?? "";
      const heading = line.match(/^##\s+(.*)$/);
      if (heading?.[1]) {
        flush();
        current = heading[1].trim();
        if (!sectionOrder.includes(current)) sectionOrder.push(current);
        sectionLine[current] = i;
        buf = [];
      } else if (current !== null) {
        buf.push(line);
      }
    }
    flush();
  }

  const sectionByName = (candidates: string[]): string => {
    for (const name of sectionOrder) {
      const lower = name.toLowerCase();
      if (candidates.some((c) => lower === c || lower.startsWith(c))) {
        return sections[name] ?? "";
      }
    }
    return "";
  };
  const sectionLineOf = (candidates: string[]): number => {
    for (const name of sectionOrder) {
      const lower = name.toLowerCase();
      if (candidates.some((c) => lower === c || lower.startsWith(c))) {
        return sectionLine[name] ?? 0;
      }
    }
    return 0;
  };

  // ── status / priority ────────────────────────────────────
  const statusRaw = fields["status"] ?? "";
  const statusFolded = foldWord(statusRaw, STATUS_WORDS);
  if (!statusRaw) {
    warnings.push({
      file, field: "Status", value: "",
      message: "no Status field, filed under open",
    });
  } else if (!statusFolded) {
    warnings.push({
      file, field: "Status", value: statusRaw,
      message: "unrecognized status, filed under open",
    });
  }
  const status: Status = statusFolded ?? "open";

  const priorityRaw = fields["priority"] ?? "";
  const priorityFolded = foldWord(priorityRaw, PRIORITY_WORDS);
  if (priorityRaw && !priorityFolded) {
    warnings.push({
      file, field: "Priority", value: priorityRaw,
      message: "unrecognized priority, filed under medium",
    });
  }
  const priority: Priority = priorityFolded ?? "medium";

  const agent = (fields["agent"] ?? "unassigned").trim() || "unassigned";
  const area = (fields["area"] ?? "").trim();

  const notes = parseNotes(
    sectionByName(["agent notes", "notes"]),
    sectionLineOf(["agent notes", "notes"]),
  );
  const dates = notes.map((n) => n.date).sort();

  const task: Task = {
    id: file.replace(/\.md$/, ""),
    number,
    duplicateNumber: false,
    num: Number(number),
    file,
    path,
    title,
    status,
    statusRaw: statusRaw || status,
    priority,
    priorityRaw: priorityRaw || priority,
    owner: (fields["owner"] ?? "unassigned").trim() || "unassigned",
    agent,
    agentKey: agent.toLowerCase(),
    area,
    areas: area ? area.split(",").map((a) => a.trim()).filter(Boolean) : [],
    areaPaths: [],
    fileRefs: parseFileRefs(text),
    files: [],
    parent: taskNumbers(fields["parent"] ?? "")[0] ?? null,
    dependsOn: taskNumbers(fields["dependson"] ?? ""),
    references: parseReferences(fields["references"] ?? ""),
    sections,
    sectionOrder,
    subtasks: parseSubtasks(sectionByName(["subtasks", "sub tasks"])),
    notes,
    lastActivity: dates.length ? dates[dates.length - 1]! : null,
    mtime,
    size,
    lines: lines.length,
    children: [],
    blocks: [],
    rollup: null,
  };

  return { task, warnings };
}
