import { el, svg, ICON } from "../lib/dom.js";
import { ago, bytes, num, stamp, statusLabel } from "../lib/format.js";
import { renderMarkdown } from "../lib/md.js";
import { isOperationalStatus } from "../lib/status.js";

const SUB_FILTERS = [
  ["all", "All"],
  ["wishlist", "Wishlist"],
  ["open", "Open"],
  ["in_progress", "Active"],
  ["blocked", "Blocked"],
  ["done", "Done"],
];

const HIDDEN_SECTIONS = new Set(["agent notes", "notes", "subtasks", "sub tasks"]);
const ROLLUP_ORDER = ["done", "in_progress", "blocked", "open", "wishlist"];

let subFilter = "all";
let expanded = new Set();

export function resetDetailState() {
  subFilter = "all";
  expanded = new Set();
}

function metaRow(key, value, title) {
  return el("div", { style: { display: "flex", alignItems: "baseline", gap: "6px" }, title: title || value },
    el("span.d-meta-k", null, key),
    el("span.d-meta-v", null, value),
  );
}

function rollupPanel(task) {
  const rollup = task.rollup;
  if (!rollup || !rollup.total) return null;

  const segments = ROLLUP_ORDER.filter((k) => rollup[k] > 0);

  return el("div.panel", { style: { display: "flex", flexDirection: "column", gap: "11px" } },
    el("div", { style: { display: "flex", alignItems: "baseline", gap: "10px" } },
      el("span.sec-name", null, "SUBTASK ROLLUP"),
      el("div.grow"),
      el("span", { class: "mono", style: { fontSize: "15px", fontWeight: 600, color: "var(--st-done)" } }, String(rollup.done)),
      el("span", { class: "mono", style: { fontSize: "12px", color: "var(--faint)" } }, `of ${rollup.total} done`),
    ),
    el("div.rollup-bar", null,
      segments.map((key) =>
        el("span", { style: { flex: `${rollup[key]} 1 0`, background: `var(--st-${key})` } }),
      ),
    ),
    el("div.rollup-legend", null,
      segments.map((key) =>
        el("div", null,
          el("span.dot", { style: { background: `var(--st-${key})` } }),
          el("span", null, `${rollup[key]} ${statusLabel(key).toLowerCase()}`),
        ),
      ),
      el("div.grow"),
      el("span.sec-hint", null, "ROLLED UP FROM THE CHILD FILES, NOT THE CHECKBOXES"),
    ),
  );
}

function section(name, body) {
  return el("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } },
    el("div.sec-head", null,
      el("span.sec-name", null, name.toUpperCase()),
      el("div.sec-rule"),
    ),
    el("div.md", { html: renderMarkdown(body) }),
  );
}

function subtaskRows(task, ctx) {
  // Children come from both directions: a child naming this task as Parent,
  // and this task listing it under Subtasks. Either alone is enough.
  const declared = new Map(task.subtasks.map((s) => [s.number, s]));
  const rows = new Map();

  for (const id of task.children) {
    const child = ctx.byId.get(id);
    if (child) rows.set(id, { id, task: child, declared: declared.get(child.number) });
  }
  // A subtask line naming a number that resolves to no file still gets a row,
  // so a broken link is visible rather than quietly absent.
  for (const sub of task.subtasks) {
    const matches = ctx.resolve(sub.number);
    if (!matches.length) {
      rows.set(`missing:${sub.number}`, { id: sub.number, task: null, declared: sub });
      continue;
    }
    for (const match of matches) {
      if (!rows.has(match.id)) rows.set(match.id, { id: match.id, task: match, declared: sub });
    }
  }
  if (!rows.size) return null;

  const ordered = [...rows.values()].sort((a, b) => {
    const left = a.task?.num ?? Number(a.id);
    const right = b.task?.num ?? Number(b.id);
    return left - right || String(a.id).localeCompare(String(b.id));
  });

  const visible = ordered.filter((row) => {
    if (subFilter === "all") return true;
    return row.task?.status === subFilter;
  });

  return el("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } },
    el("div.sec-head", null,
      el("span.sec-name", null, "SUBTASKS"),
      el("span.sec-hint", null, String(ordered.length)),
      el("div.sec-rule"),
      el("div.seg.tight", null,
        SUB_FILTERS.map(([key, label]) =>
          el("button.seg-item" + (subFilter === key ? ".on" : ""), {
            onclick: () => { subFilter = key; ctx.rerender(); },
          }, label),
        ),
      ),
    ),
    el("div", { style: { display: "flex", flexDirection: "column", gap: "5px" } },
      visible.length
        ? visible.map((row) => {
            const child = row.task;
            const status = child?.status ?? "open";
            const colour = `var(--st-${status})`;
            const title = child?.title || row.declared?.title || "(missing task file)";
            return el("div.subrow", {
              onclick: child ? () => ctx.openTask(child.id) : null,
              style: child ? null : { opacity: 0.55, cursor: "default" },
            },
              el("span.hair", { style: { background: child ? colour : "var(--dim)" } }),
              el("span.n", null, child ? child.number : row.id),
              el("span.t", { title }, title),
              child
                ? el("span.badge", { style: { color: colour, borderColor: colour } }, statusLabel(status))
                : el("span.badge", { style: { color: "var(--dim)", borderColor: "var(--line)" } }, "NO FILE"),
              el("span.ago", null, child ? ago(child.lastActivity) : ""),
            );
          })
        : el("div.col-empty", null, "NO SUBTASKS IN THIS STATE"),
    ),
  );
}

function noteRows(task) {
  if (!task.notes.length) return null;
  const ordered = task.notes.slice().reverse();

  return el("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } },
    el("div.sec-head", null,
      el("span.sec-name", null, "AGENT NOTES"),
      el("span.sec-hint", null, String(ordered.length)),
      el("div.sec-rule"),
      el("span.sec-hint", null, "NEWEST FIRST · CLICK TO EXPAND"),
    ),
    el("div", null,
      ordered.map((note, index) => {
        const newest = index === 0;
        const open = expanded.has(index);
        const long = note.text.length > 150;
        return el("div.note", {
          onclick: () => {
            if (open) expanded.delete(index);
            else expanded.add(index);
            rerenderNotes();
          },
        },
          el("div.note-date" + (newest ? ".hot" : ""), null, note.date),
          el("div.entry-spine", null,
            el("i", {
              style: newest
                ? { background: "var(--accent)", borderColor: "var(--accent)" }
                : { background: "var(--bg)", borderColor: "#3d3a33" },
            }),
            el("u"),
          ),
          el("div.note-body", null,
            el("div", { class: "note-text" + (open || !long ? "" : " clip") }, note.text || "(no text)"),
            el("div.entry-foot", null,
              el("span.entry-agent", null, note.agent || task.agent),
              long ? el("span.note-more", null, open ? "collapse" : "expand") : null,
            ),
          ),
        );
      }),
    ),
  );
}

let rerenderNotes = () => {};

function relationPanel(task, ctx) {
  // Forward edges are written as numbers, which may be ambiguous; reverse
  // edges were derived from real files so they are already ids.
  const fromNumbers = (numbers) =>
    numbers.flatMap((number) => {
      const matches = ctx.resolve(number);
      if (!matches.length) return [{ label: number, task: null }];
      return matches.map((match) => ({
        label: matches.length > 1 ? `${match.number}*` : match.number,
        task: match,
      }));
    });
  const fromIds = (ids) =>
    ids.map((id) => {
      const other = ctx.byId.get(id);
      return { label: other ? other.number : id, task: other || null };
    });

  const groups = [
    { kind: "PARENT", hint: "Parent:", rows: fromNumbers(task.parent ? [task.parent] : []) },
    { kind: "DEPENDS ON", hint: "Depends on:", rows: fromNumbers(task.dependsOn) },
    { kind: "BLOCKS", hint: "DERIVED — REVERSE EDGE", rows: fromIds(task.blocks) },
  ];

  return el("div.panel", { style: { display: "flex", flexDirection: "column", gap: "13px" } },
    el("span.sec-name", null, "RELATIONS"),
    groups.map((group) =>
      el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } },
        el("div", { style: { display: "flex", alignItems: "baseline", gap: "7px" } },
          el("span.rel-kind", null, group.kind),
          el("span.rel-kind", null, group.hint),
        ),
        group.rows.length
          ? group.rows.map((row) => {
              const other = row.task;
              const colour = other ? `var(--st-${other.status})` : "var(--dim)";
              return el("div.relrow", { onclick: other ? () => ctx.openTask(other.id) : null },
                el("span.hair", { style: { background: colour } }),
                el("span.n", null, row.label),
                el("span.t", { title: other?.title || "" }, other?.title || "(missing task file)"),
              );
            })
          : el("span.rel-none", null, "none"),
      ),
    ),
  );
}

function referencePanel(task, ctx) {
  if (!task.references.length) return null;

  return el("div.panel", { style: { display: "flex", flexDirection: "column", gap: "10px" } },
    el("span.sec-name", null, "REFERENCES"),
    task.references.map((reference) => {
      const isUrl = reference.kind === "url";
      return el("div.reffile", {
        onclick: () => {
          if (isUrl) window.open(reference.target, "_blank", "noopener");
          else window.open(`/api/reference?backlog=${encodeURIComponent(ctx.backlog.id)}&path=${encodeURIComponent(reference.target)}`, "_blank", "noopener");
        },
      },
        svg(isUrl ? ICON.link : ICON.file, { size: 13, stroke: "var(--muted)" }),
        el("div", { style: { minWidth: 0 } },
          el("div.p", null, reference.label),
          el("span", { class: "mono", style: { fontSize: "9.5px", color: "var(--dim)" } },
            isUrl ? "EXTERNAL LINK" : "REFERENCE FILE · READ ON DEMAND"),
        ),
      );
    }),
  );
}

/**
 * Files the task's own text names. Each one routes into the Files view opened
 * on that file, which is where the other tasks touching it are listed.
 */
function filePanel(task, ctx) {
  if (!task.files.length) return null;

  // Which of these files other operational tasks are also pointing at.
  const contended = new Map();
  for (const other of ctx.allTasks) {
    if (other.id === task.id || !isOperationalStatus(other.status)) continue;
    for (const file of other.files) {
      if (task.files.includes(file)) contended.set(file, (contended.get(file) || 0) + 1);
    }
  }

  return el("div.panel", { style: { display: "flex", flexDirection: "column", gap: "10px" } },
    el("div", { style: { display: "flex", alignItems: "baseline", gap: "8px" } },
      el("span.sec-name", null, "FILES"),
      el("span.sec-hint", null, String(task.files.length)),
    ),
    el("div", { style: { display: "flex", flexDirection: "column", gap: "4px" } },
      task.files.map((file) => {
        const others = contended.get(file) || 0;
        return el("div.reffile", {
          title: others ? `${others} other active task${others === 1 ? "" : "s"} also name this file` : file,
          onclick: () => ctx.goFile(file),
        },
          svg(ICON.file, { size: 12, stroke: others ? "var(--st-blocked)" : "var(--muted)" }),
          el("span.filepath", { style: { fontSize: "10.5px" } }, file),
          others
            ? el("span.blockcount", {
                style: { color: "var(--st-blocked)", borderColor: "var(--st-blocked)" },
              }, `+${others}`)
            : null,
        );
      }),
    ),
    contended.size
      ? el("span", { style: { fontSize: "11px", lineHeight: "1.5", color: "var(--faint)" } },
          "Marked files are also named by active tasks elsewhere.")
      : null,
  );
}

function activityPanel(task) {
  const dates = task.notes.map((n) => n.date).sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  const span = new Set(dates).size;

  return el("div.panel", { style: { display: "flex", flexDirection: "column", gap: "11px" } },
    el("span.sec-name", null, "ACTIVITY"),
    el("div", { style: { display: "flex", alignItems: "baseline", gap: "8px" } },
      el("span", { class: "mono", style: { fontSize: "20px", fontWeight: 600 } }, String(task.notes.length)),
      el("span", { style: { fontSize: "12px", color: "var(--muted)" } },
        `note${task.notes.length === 1 ? "" : "s"} across ${span} day${span === 1 ? "" : "s"}`),
    ),
    first ? el("div", { style: { display: "flex", justifyContent: "space-between" } },
      el("span", { class: "mono", style: { fontSize: "10px", color: "var(--dim)" } }, first),
      el("span", { class: "mono", style: { fontSize: "10px", color: "var(--dim)" } }, last),
    ) : null,
    el("div", { style: { height: "1px", background: "var(--line-soft)" } }),
    el("div", { style: { display: "flex", flexDirection: "column", gap: "5px" } },
      el("div.kv", null, el("span.k", null, "STATUS"), el("span.v", null, task.statusRaw)),
      el("div.kv", null, el("span.k", null, "LINES"), el("span.v", null, num(task.lines))),
      el("div.kv", null, el("span.k", null, "SIZE"), el("span.v", null, bytes(task.size))),
      el("div.kv", null, el("span.k", null, "MODIFIED"), el("span.v", null, stamp(task.mtime))),
      el("div.kv", { title: task.file }, el("span.k", null, "FILE"), el("span.v", null, task.file)),
    ),
  );
}

export function renderDetail(task, ctx) {
  const colour = `var(--st-${task.status})`;

  const notesHost = el("div");
  rerenderNotes = () => {
    const next = noteRows(task);
    notesHost.replaceChildren(...(next ? [next] : []));
  };
  rerenderNotes();

  const prose = task.sectionOrder
    .filter((name) => !HIDDEN_SECTIONS.has(name.toLowerCase()))
    .filter((name) => (task.sections[name] || "").trim())
    .map((name) => section(name, task.sections[name]));

  return el("div.detail", null,
    el("div.detail-in", null,
      el("div.detail-main", null,
        el("div", { style: { display: "flex", flexDirection: "column", gap: "11px" } },
          el("div", { style: { display: "flex", alignItems: "center", gap: "9px" } },
            el("span.d-num", null, task.number),
            el("span.badge", { style: { color: colour, borderColor: colour, fontSize: "9.5px", padding: "3px 8px" } },
              statusLabel(task.status)),
            el("span.pill", {
              style: { color: `var(--pr-${task.priority})`, borderColor: `var(--pr-${task.priority})`, fontSize: "9.5px", padding: "3px 8px" },
            }, task.priority.toUpperCase()),
            task.statusRaw.toLowerCase() !== task.status
              ? el("span.sec-hint", { title: "raw Status field in the file" }, `RAW: ${task.statusRaw}`)
              : null,
            task.duplicateNumber
              ? el("span.badge", {
                  style: { color: "var(--st-blocked)", borderColor: "var(--st-blocked)" },
                  title: "another file in this directory claims the same task number",
                }, "DUPLICATE NUMBER")
              : null,
          ),
          el("div.d-title", null, task.title),
          el("div.d-meta", null,
            metaRow("OWNER", task.owner),
            metaRow("AGENT", task.agent),
            task.area ? metaRow("AREA", task.area) : null,
            metaRow("FILE", task.file),
          ),
        ),
        rollupPanel(task),
        prose,
        subtaskRows(task, ctx),
        notesHost,
      ),
      el("div.detail-rail", null,
        relationPanel(task, ctx),
        filePanel(task, ctx),
        referencePanel(task, ctx),
        activityPanel(task),
      ),
    ),
  );
}

export function detailCrumb(task, ctx) {
  return el("div.crumb", null,
    el("button", { onclick: () => ctx.goBack() },
      svg(ICON.back, { size: 14, stroke: "var(--muted)" }), "Board"),
    task.area ? el("span.sep", null, "/") : null,
    task.area ? el("span", null, task.area.split(",")[0].trim()) : null,
    el("span.sep", null, "/"),
    el("span.here", null, task.number),
  );
}
