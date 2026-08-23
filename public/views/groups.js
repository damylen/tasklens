import { el, svg, ICON } from "../lib/dom.js";
import { ago, num, statusLabel } from "../lib/format.js";
import { areaLabel } from "../lib/area.js";

const MODES = [
  ["parent", "By parent"],
  ["blocking", "By dependency"],
];

let mode = "parent";
let expanded = new Set();
let limit = 60;
/** Ids of the rows the last build actually drew — what EXPAND ALL acts on. */
let expandable = [];

function statusChip(task, extra = {}) {
  const colour = `var(--st-${task.status})`;
  return el("span.badge", {
    style: { color: colour, borderColor: colour, ...extra },
  }, statusLabel(task.status));
}

function rollupBar(rollup, width = 90) {
  if (!rollup || !rollup.total) return null;
  const order = ["done", "in_progress", "blocked", "open"];
  return el("div.mini-roll", { style: { width: `${width}px` }, title:
    order.map((k) => `${rollup[k]} ${k.replace("_", " ")}`).join(" · ") },
    order.filter((k) => rollup[k] > 0).map((k) =>
      el("span", { style: { flex: `${rollup[k]} 1 0`, background: `var(--st-${k})` } })),
  );
}

/* ── by parent ─────────────────────────────────────────── */

function branch(task, ctx, depth, visible) {
  const open = expanded.has(task.id);
  const kids = task.children
    .map((id) => ctx.byId.get(id))
    .filter(Boolean)
    .filter((child) => visible.has(child.id) || child.children.length)
    .sort((a, b) => a.num - b.num);

  const rows = [
    el("div.treerow", {
      style: { paddingLeft: `${depth * 22}px` },
      onclick: (event) => {
        if (event.target.closest(".treeopen")) return;
        ctx.openTask(task.id);
      },
    },
      kids.length
        ? el("button.treetoggle", {
            class: "treeopen",
            title: open ? "collapse" : "expand",
            onclick: () => {
              if (open) expanded.delete(task.id);
              else expanded.add(task.id);
              ctx.rerender();
            },
          }, open ? "−" : "+")
        : el("span.treetoggle.empty"),
      el("span.hair", { style: { background: `var(--st-${task.status})` } }),
      el("span.n", null, task.number),
      el("span.t", { title: task.title }, task.title),
      areaLabel(task, ctx, { className: "row-area" }),
      task.rollup ? el("span.rollcount", null, `${task.rollup.done}/${task.rollup.total}`) : null,
      rollupBar(task.rollup),
      statusChip(task),
      el("span.ago", null, ago(task.lastActivity)),
    ),
  ];

  if (open) {
    for (const child of kids) rows.push(...branch(child, ctx, depth + 1, visible));
  }
  return rows;
}

function byParent(ctx) {
  const visible = new Set(ctx.tasks.map((t) => t.id));

  // A root is an umbrella whose own parent is not itself an umbrella in view.
  const roots = ctx.allTasks
    .filter((t) => t.children.length)
    .filter((t) => {
      if (!t.parent) return true;
      return !ctx.resolve(t.parent).some((p) => p.children.length);
    })
    .filter((t) => visible.has(t.id) || t.children.some((id) => visible.has(id)))
    .sort((a, b) => {
      const left = a.lastActivity || "";
      const right = b.lastActivity || "";
      return right.localeCompare(left) || a.num - b.num;
    });

  const shown = roots.slice(0, limit);
  for (const root of shown) expandable.push(root.id);
  const body = el("div.treelist");
  for (const root of shown) body.append(...branch(root, ctx, 0, visible));

  const flat = ctx.tasks.filter((t) => !t.parent && !t.children.length).length;

  return { body, shown: shown.length, total: roots.length,
    note: `${num(flat)} tasks in view belong to no group` };
}

/* ── by dependency ─────────────────────────────────────── */

function byBlocking(ctx) {
  const visible = new Set(ctx.tasks.map((t) => t.id));

  const blockers = ctx.allTasks
    .filter((t) => t.blocks.length)
    .map((t) => {
      const waiters = t.blocks.map((id) => ctx.byId.get(id)).filter(Boolean);
      const openWaiters = waiters.filter((w) => w.status !== "done");
      return { task: t, waiters, openWaiters };
    })
    .filter((row) => visible.has(row.task.id) || row.waiters.some((w) => visible.has(w.id)))
    // Real bottlenecks first: an unfinished task with people waiting on it.
    .sort((a, b) => {
      const aLive = a.task.status !== "done" && a.openWaiters.length > 0;
      const bLive = b.task.status !== "done" && b.openWaiters.length > 0;
      if (aLive !== bLive) return aLive ? -1 : 1;
      return b.openWaiters.length - a.openWaiters.length || a.task.num - b.task.num;
    });

  const shown = blockers.slice(0, limit);
  for (const row of shown) expandable.push(row.task.id);
  const body = el("div.treelist");

  for (const row of shown) {
    const task = row.task;
    const live = task.status !== "done" && row.openWaiters.length > 0;
    const open = expanded.has(task.id);

    body.append(
      el("div.treerow" + (live ? ".live" : ""), {
        onclick: (event) => {
          if (event.target.closest(".treeopen")) return;
          ctx.openTask(task.id);
        },
      },
        el("button.treetoggle", {
          class: "treeopen",
          onclick: () => {
            if (open) expanded.delete(task.id);
            else expanded.add(task.id);
            ctx.rerender();
          },
        }, open ? "−" : "+"),
        el("span.hair", { style: { background: `var(--st-${task.status})` } }),
        el("span.n", null, task.number),
        el("span.t", { title: task.title }, task.title),
        areaLabel(task, ctx, { className: "row-area" }),
        el("span.blockcount", {
          style: live ? { color: "var(--st-blocked)", borderColor: "var(--st-blocked)" } : null,
          title: `${row.openWaiters.length} unfinished of ${row.waiters.length} waiting`,
        }, `${row.openWaiters.length}/${row.waiters.length} waiting`),
        statusChip(task),
        el("span.ago", null, ago(task.lastActivity)),
      ),
    );

    if (open) {
      for (const waiter of row.waiters.sort((a, b) => a.num - b.num)) {
        body.append(
          el("div.treerow.child", {
            style: { paddingLeft: "22px" },
            onclick: () => ctx.openTask(waiter.id),
          },
            el("span.treetoggle.empty"),
            el("span.waitarrow", null, "waits on"),
            el("span.hair", { style: { background: `var(--st-${waiter.status})` } }),
            el("span.n", null, waiter.number),
            el("span.t", { title: waiter.title }, waiter.title),
            statusChip(waiter),
            el("span.ago", null, ago(waiter.lastActivity)),
          ),
        );
      }
    }
  }

  const live = blockers.filter((r) => r.task.status !== "done" && r.openWaiters.length).length;
  return { body, shown: shown.length, total: blockers.length,
    note: `${num(live)} unfinished tasks have something waiting on them` };
}

/* ── view ──────────────────────────────────────────────── */

function build(ctx) {
  expandable = [];
  const result = mode === "parent" ? byParent(ctx) : byBlocking(ctx);
  const wrap = el("div.stream");
  const inner = el("div.stream-in.tree-in");
  wrap.append(inner);

  inner.append(
    el("div.day-head", null,
      el("span.day-label.hot", null, mode === "parent" ? "GROUPS" : "BLOCKERS"),
      el("div.day-rule"),
      el("span.day-meta", null,
        `${num(result.shown)}${result.shown < result.total ? ` of ${num(result.total)}` : ""} · ${result.note}`),
    ),
  );

  if (!result.shown) {
    inner.append(el("div.empty", null,
      el("div.big", null, mode === "parent" ? "No groups match these filters" : "Nothing is blocking anything here"),
      el("div.small", null, "widen the area filter or clear the search"),
    ));
    return wrap;
  }

  inner.append(result.body);

  if (result.shown < result.total) {
    inner.append(
      el("div", { style: { display: "flex", justifyContent: "center", padding: "18px 0 0" } },
        el("button.chip", { onclick: () => { limit += 60; ctx.rerender(); } },
          `SHOW MORE · ${num(result.total - result.shown)} REMAINING`),
      ),
    );
  }
  return wrap;
}

export default {
  id: "groups",
  label: "Groups",
  filters: ["search", "priority", "area", "since"],

  toolbar(ctx) {
    return el("div", { style: { display: "flex", alignItems: "center", gap: "14px" } },
      el("span.rail-label", null, "GROUP BY"),
      el("div.seg.tight", null,
        MODES.map(([key, label]) =>
          el("button.seg-item" + (mode === key ? ".on" : ""), {
            onclick: () => { mode = key; limit = 60; expanded = new Set(); ctx.rerender(); },
          }, label),
        ),
      ),
      el("div.rail-div"),
      el("button.chip", {
        // Bounded by the rows the last build drew, so it never walks the
        // whole backlog looking for something to open.
        onclick: () => {
          expanded = expanded.size ? new Set() : new Set(expandable);
          ctx.rerender();
        },
      }, expanded.size ? "COLLAPSE ALL" : "EXPAND ALL"),
    );
  },

  mount(ctx) {
    return build(ctx);
  },

  update(root, ctx) {
    const top = root.scrollTop;
    const fresh = build(ctx);
    root.replaceChildren(...fresh.childNodes);
    root.scrollTop = top;
  },
};
