export type Status = "wishlist" | "open" | "in_progress" | "blocked" | "done";
export type Priority = "critical" | "high" | "medium" | "low";

export interface Note {
  /** YYYY-MM-DD as written in the file. */
  date: string;
  /** Trailing name on the entry (`- 2026-02-14 Alice:`), else null. */
  agent: string | null;
  text: string;
  line: number;
}

export interface Subtask {
  number: string;
  title: string;
  /** null when the list item carries no checkbox. */
  checked: boolean | null;
}

export interface Reference {
  label: string;
  target: string;
  kind: "url" | "path";
}

export interface Rollup {
  wishlist: number;
  open: number;
  in_progress: number;
  blocked: number;
  done: number;
  total: number;
}

export interface Task {
  /**
   * Stable unique key: the filename without `.md`. Task NUMBERS are not unique
   * in practice — concurrent agents pick "the next number" and collide — so the
   * file is the identity and the number is only a label.
   */
  id: string;
  number: string;
  /** True when another file in the directory claims the same number. */
  duplicateNumber: boolean;
  num: number;
  file: string;
  path: string;
  title: string;

  status: Status;
  statusRaw: string;
  priority: Priority;
  priorityRaw: string;

  owner: string;
  agent: string;
  agentKey: string;
  area: string;
  areas: string[];
  /**
   * Normalized area paths, e.g. `["web/app/editor"]`. Derived across the whole
   * set by the store, because folding `web-app` onto `web/app` needs to know
   * which groups and children exist elsewhere.
   */
  areaPaths: string[];

  /** Source files named in the document, normalized but not yet folded. */
  fileRefs: string[];
  /**
   * Canonical files this task touches. Folded across the whole set by the
   * store, because `Editor.vue` and `web/src/components/Editor.vue` are one
   * file and only the full set knows that.
   */
  files: string[];

  /** Referenced task NUMBERS, resolved to ids by the store. */
  parent: string | null;
  dependsOn: string[];
  references: Reference[];

  /** H2 heading -> raw markdown body, in file order. */
  sections: Record<string, string>;
  sectionOrder: string[];

  subtasks: Subtask[];
  notes: Note[];

  /** Newest dated Agent Note. The activity clock — never mtime. */
  lastActivity: string | null;

  mtime: number;
  size: number;
  lines: number;

  /** Derived by the store from the whole set. Task ids, not numbers. */
  children: string[];
  blocks: string[];
  rollup: Rollup | null;
}

export interface Warning {
  file: string;
  field: string;
  value: string;
  message: string;
}

export interface Meta {
  root: string;
  scannedAt: number;
  counts: Record<Status, number>;
  total: number;
  /** Dashed area names folded onto their slash equivalent. */
  areaFolds: number;
  /** File paths folded onto a longer path naming the same file. */
  fileFolds: number;
  /** Distinct canonical files named across the backlog. */
  fileCount: number;
  noteCount: number;
  warnings: Warning[];
}
