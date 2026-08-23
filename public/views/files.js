import { el, svg, ICON } from "../lib/dom.js";
import { ago, num, statusLabel } from "../lib/format.js";

const SORTS = [
  ["tasks", "Most tasks"],
  ["recent", "Recent"],
  ["path", "Path"],
];

let sort = "tasks";
let expanded = new Set();
let limit = 80;
let warningsOpen = true;

/**
 * The reverse index: canonical file -> the tasks naming it. Built in the
 * browser from the tasks it already holds, so an SSE delta keeps it fresh
 * without a second endpoint to invalidate.
 */
function buildIndex(tasks) {
  const index = new Map();
  for (const task of tasks) {
    for (const file of task.files) {
      const entry = index.get(file);
      if (entry) entry.push(task);
      else index.set(file, [task]);
    }
  }
  return index;
}

function fileRow(path, tasks, ctx, { warn = false, scope = "all" } = {}) {
  // A contended file also appears in the full list below. Scoping the expand
  // key keeps opening one from silently opening the other.
  const key = `${scope}:${path}`;
  const open = expanded.has(key);
  const unfinished = tasks.filter((t) => t.status !== "done");
  const newest = tasks.reduce((a, t) => (t.lastActivity || "") > a ? (t.lastActivity || "") : a, "");
  const counts = { open: 0, in_progress: 0, blocked: 0, done: 0 };
  for (const task of tasks) counts[task.status]++;

  const rows = [
    el("div.treerow" + (warn ? ".live" : ""), {
      onclick: (event) => {
        if (event.target.closest(".treeopen")) return;
        if (open) expanded.delete(key);
        else expanded.add(key);
        ctx.rerender();
      },
    },
      el("button.treetoggle.treeopen", {
        onclick: () => {
          if (open) expanded.delete(key);
          else expanded.add(key);
          ctx.rerender();
        },
      }, open ? "−" : "+"),
      svg(ICON.file, { size: 12, stroke: warn ? "var(--st-blocked)" : "var(--faint)" }),
      el("span.filepath", { title: path }, path),
      el("div.mini-roll", { style: { width: "72px" },
        title: ["done", "in_progress", "blocked", "open"].map((k) => `${counts[k]} ${k.replace("_", " ")}`).join(" · ") },
        ["done", "in_progress", "blocked", "open"].filter((k) => counts[k] > 0).map((k) =>
          el("span", { style: { flex: `${counts[k]} 1 0`, background: `var(--st-${k})` } })),
      ),
      el("span.blockcount", {
        style: warn ? { color: "var(--st-blocked)", borderColor: "var(--st-blocked)" } : null,
        title: `${unfinished.length} unfinished of ${tasks.length} tasks naming this file`,
      }, `${unfinished.length}/${tasks.length}`),
      el("span.ago", null, ago(newest)),
    ),
  ];

  if (open) {
    for (const task of tasks.slice().sort((a, b) => (b.lastActivity || "").localeCompare(a.lastActivity || "") || a.num - b.num)) {
      const colour = `var(--st-${task.status})`;
      rows.push(
        el("div.treerow.child", { style: { paddingLeft: "22px" }, onclick: () => ctx.openTask(task.id) },
          el("span.treetoggle.empty"),
          el("span.hair", { style: { background: colour } }),
          el("span.n", null, task.number),
          el("span.t", { title: task.title }, task.title),
          el("span.badge", { style: { color: colour, borderColor: colour } }, statusLabel(task.status)),
          el("span.ago", null, ago(task.lastActivity)),
        ),
      );
    }
  }
  return rows;
}

function build(ctx) {
  const index = buildIndex(ctx.tasks);
  const wrap = el("div.stream");
  const inner = el("div.stream-in.tree-in");
  wrap.append(inner);

  if (!index.size) {
    inner.append(el("div.empty", null,
      el("div.big", null, "No files named by the tasks in view"),
      el("div.small", null, "files are read from backticked paths in the task text"),
    ));
    return wrap;
  }

  // ── contention warning ──
  // Two or more UNFINISHED tasks pointing at one file is the collision worth
  // surfacing: finished tasks naming a file are history, not a conflict.
  const contended = [...index.entries()]
    .map(([path, tasks]) => ({ path, tasks, open: tasks.filter((t) => t.status !== "done") }))
    .filter((row) => row.open.length >= 2)
    .sort((a, b) => b.open.length - a.open.length || a.path.localeCompare(b.path));

  if (contended.length) {
    inner.append(
      el("div.day-head", null,
        el("div.day-label", { style: { color: "var(--st-blocked)" } }, "CONTENDED"),
        el("div.day-rule"),
        el("span.day-meta", null,
          `${num(contended.length)} file${contended.length === 1 ? "" : "s"} that two or more unfinished tasks point at`),
        el("button.colbtn", {
          title: warningsOpen ? "collapse" : "expand",
          onclick: () => { warningsOpen = !warningsOpen; ctx.rerender(); },
        }, svg(warningsOpen ? ICON.chevronUp : ICON.chevronDown, { size: 13, stroke: "currentColor" })),
      ),
    );
    if (warningsOpen) {
      const body = el("div.treelist");
      for (const row of contended.slice(0, 25)) {
        body.append(...fileRow(row.path, row.tasks, ctx, { warn: true, scope: "warn" }));
      }
      inner.append(body);
      if (contended.length > 25) {
        inner.append(el("div.sec-hint", { style: { padding: "8px 0 0 30px" } },
          `${num(contended.length - 25)} MORE CONTENDED FILES BELOW IN THE FULL LIST`));
      }
    }
  }

  // ── focused file ──
  // A file routed in from the detail page may sort far below the visible
  // window, so it gets its own section rather than being unreachable.
  if (ctx.param) {
    const tasks = index.get(ctx.param);
    inner.append(
      el("div.day-head", null,
        el("div.day-label.hot", null, "FILE"),
        el("div.day-rule"),
        el("span.day-meta", null, tasks ? `${num(tasks.length)} tasks name it` : "not named by any task in view"),
        el("button.colbtn", { title: "clear", onclick: () => ctx.goView("files") },
          svg(ICON.back, { size: 13, stroke: "currentColor" })),
      ),
    );
    if (tasks) {
      const body = el("div.treelist");
      body.append(...fileRow(ctx.param, tasks, ctx, { scope: "focus" }));
      inner.append(body);
    }
  }

  // ── full list ──
  const all = [...index.entries()].map(([path, tasks]) => ({ path, tasks }));
  all.sort((a, b) => {
    if (sort === "path") return a.path.localeCompare(b.path);
    if (sort === "recent") {
      const left = a.tasks.reduce((m, t) => (t.lastActivity || "") > m ? (t.lastActivity || "") : m, "");
      const right = b.tasks.reduce((m, t) => (t.lastActivity || "") > m ? (t.lastActivity || "") : m, "");
      return right.localeCompare(left);
    }
    return b.tasks.length - a.tasks.length || a.path.localeCompare(b.path);
  });

  const shown = all.slice(0, limit);
  inner.append(
    el("div.day-head", null,
      el("div.day-label.hot", null, "FILES"),
      el("div.day-rule"),
      el("span.day-meta", null,
        `${num(shown.length)}${shown.length < all.length ? ` of ${num(all.length)}` : ""} · named by ${num(ctx.tasks.filter((t) => t.files.length).length)} tasks in view`),
    ),
  );

  const body = el("div.treelist");
  for (const row of shown) body.append(...fileRow(row.path, row.tasks, ctx));
  inner.append(body);

  if (shown.length < all.length) {
    inner.append(
      el("div", { style: { display: "flex", justifyContent: "center", padding: "18px 0 0" } },
        el("button.chip.tiny", { onclick: () => { limit += 80; ctx.rerender(); } },
          `SHOW MORE · ${num(all.length - shown.length)} REMAINING`),
      ),
    );
  }
  return wrap;
}

export default {
  id: "files",
  label: "Files",
  filters: ["search", "priority", "status", "area"],

  toolbar(ctx) {
    return el("div", { style: { display: "flex", alignItems: "center", gap: "10px" } },
      el("span.rail-label", null, "SORT"),
      el("div.seg.tight", null,
        SORTS.map(([key, label]) =>
          el("button.seg-item" + (sort === key ? ".on" : ""), {
            onclick: () => { sort = key; limit = 80; ctx.rerender(); },
          }, label),
        ),
      ),
    );
  },

  mount(ctx) {
    // A file handed in through the route opens straight to its task list.
    if (ctx.param) expanded = new Set([`focus:${ctx.param}`]);
    return build(ctx);
  },

  update(root, ctx) {
    const top = root.scrollTop;
    const fresh = build(ctx);
    root.replaceChildren(...fresh.childNodes);
    root.scrollTop = top;
  },
};
