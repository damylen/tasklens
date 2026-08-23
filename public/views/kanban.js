import { el, clear, svg, ICON } from "../lib/dom.js";
import { ago, num } from "../lib/format.js";
import { virtualList } from "../lib/virtual.js";
import { areaLabel } from "../lib/area.js";

const COLUMNS = [
  { key: "wishlist", label: "WISHLIST" },
  { key: "open", label: "OPEN" },
  { key: "in_progress", label: "IN PROGRESS" },
  { key: "blocked", label: "BLOCKED" },
  { key: "done", label: "DONE" },
];

const CARD_H = 96;
const GAP = 7;
const EXPANDED = "expanded";
const COLLAPSED = "collapsed";
const HIDDEN = "hidden";

const defaults = () =>
  Object.fromEntries(COLUMNS.map((c) => [c.key, EXPANDED]));

let columnState = defaults();
let persisted = null;
const lists = [];

/**
 * State is scoped to the backlog being served: tasklens is built to run in
 * several folders at once, and collapsing a column in one project must not
 * collapse it in another.
 */
function ensureStore(ctx) {
  const root = ctx.meta?.root || "";
  if (persisted && persisted.root === root) return;
  persisted = { root, store: ctx.persist };
  const saved = persisted.store.read("kanban.columns", null);
  columnState = saved && typeof saved === "object"
    ? { ...defaults(), ...saved }
    : defaults();
}

function setColumn(key, value, ctx) {
  columnState[key] = value;
  persisted?.store.write("kanban.columns", columnState);
  ctx.rerender();
}

function card(task, ctx) {
  const colour = `var(--st-${task.status})`;
  const fresh = ctx.store.isFresh(task.id);

  return el("div.card" + (fresh ? ".fresh" : ""), { onclick: () => ctx.openTask(task.id) },
    el("div.card-hair", { style: { background: colour } }),
    el("div.card-in", null,
      el("div.card-top", null,
        el("span.card-n", {
          title: task.duplicateNumber ? `number ${task.number} is shared with another file` : null,
        }, task.number + (task.duplicateNumber ? "*" : "")),
        el("span.pill", {
          style: { color: `var(--pr-${task.priority})`, borderColor: `var(--pr-${task.priority})` },
        }, task.priority.toUpperCase()),
        el("div.grow"),
        fresh ? el("span.freshdot") : null,
        el("span.card-ago", null, ago(task.lastActivity)),
      ),
      el("div.card-title", { title: task.title }, task.title),
      el("div.card-foot", null,
        areaLabel(task, ctx),
        el("span.card-agent", null, task.agent),
      ),
    ),
  );
}

function collapsedColumn(def, tasks, ctx) {
  const colour = `var(--st-${def.key})`;
  return el("div.col.rail-mode", {
    title: `${def.label} — click to expand`,
    onclick: () => setColumn(def.key, EXPANDED, ctx),
  },
    el("div.railcol", null,
      el("span.dot", { style: { background: colour } }),
      el("span.railcol-n", { style: { color: colour } }, num(tasks.length)),
      el("div.railcol-l", null, def.label),
      el("div.grow"),
      svg(ICON.expand, { size: 13, stroke: "var(--faint)" }),
    ),
  );
}

function expandedColumn(def, tasks, ctx, total) {
  const colour = `var(--st-${def.key})`;
  const share = Math.max(2, Math.round((tasks.length / Math.max(1, total)) * 100));

  const scroller = el("div.col-scroll");
  const inner = el("div.col-virt");
  scroller.append(inner);
  const foot = el("div.col-foot");

  const node = el("div.col.wide", null,
    el("div.col-head", null,
      el("div.col-head-row", null,
        el("span.dot", { style: { background: colour } }),
        el("span.col-name", null, def.label),
        el("div.grow"),
        el("span.col-count", { style: { color: colour } }, num(tasks.length)),
        el("button.colbtn", {
          title: `collapse ${def.label}`,
          onclick: (event) => { event.stopPropagation(); setColumn(def.key, COLLAPSED, ctx); },
        }, svg(ICON.collapse, { size: 13, stroke: "currentColor" })),
      ),
      el("div.col-bar", null, el("span", { style: { width: `${share}%`, background: colour } })),
    ),
    scroller,
  );

  if (!tasks.length) {
    inner.append(el("div.col-empty", null, "NOTHING HERE"));
    return node;
  }

  const list = virtualList({
    scroller, inner,
    count: tasks.length,
    rowHeight: CARD_H,
    gap: GAP,
    render: (index) => card(tasks[index], ctx),
  });
  lists.push(list);

  // Only a column big enough to window earns a footer; the rest would be noise.
  if (tasks.length > 40) {
    const paint = () => {
      const w = list.window();
      clear(foot).append(
        svg(ICON.rows, { size: 11, stroke: "var(--faint)" }),
        el("span", null, `VIRTUALIZED · ROWS ${w.from}–${w.to} OF ${num(w.count)}`),
      );
    };
    paint();
    scroller.addEventListener("scroll", paint, { passive: true });
    node.append(foot);
  }

  return node;
}

function build(ctx) {
  lists.length = 0;
  ensureStore(ctx);

  const board = el("div.board");
  const total = ctx.tasks.length;
  let shown = 0;

  for (const def of COLUMNS) {
    const state = columnState[def.key];
    if (state === HIDDEN) continue;
    shown++;

    const tasks = ctx.tasks
      .filter((t) => t.status === def.key)
      .sort((a, b) => {
        const left = a.lastActivity || "";
        const right = b.lastActivity || "";
        return right.localeCompare(left) || a.num - b.num;
      });

    board.append(state === COLLAPSED
      ? collapsedColumn(def, tasks, ctx)
      : expandedColumn(def, tasks, ctx, total));
  }

  if (!shown) {
    board.append(el("div.empty", null,
      el("div.big", null, "Every column is hidden"),
      el("div.small", null, "bring one back from the COLUMNS control above"),
    ));
  }
  return board;
}

export default {
  id: "kanban",
  label: "Kanban",
  filters: ["search", "priority", "status", "area"],

  toolbar(ctx) {
    ensureStore(ctx);
    return el("div", { style: { display: "flex", alignItems: "center", gap: "10px" } },
      el("span.rail-label", null, "COLUMNS"),
      el("div.chips", null,
        COLUMNS.map((def) => {
          const state = columnState[def.key];
          const on = state !== HIDDEN;
          return el("button.chip.tiny" + (on ? ".on" : ""), {
            title: on ? `hide ${def.label}` : `show ${def.label}`,
            style: on ? { color: `var(--st-${def.key})`, borderColor: "#3d3a31" } : null,
            onclick: () => setColumn(def.key, on ? HIDDEN : EXPANDED, ctx),
          }, def.label);
        }),
      ),
      el("button.chip.tiny", {
        title: "expand every visible column",
        onclick: () => {
          for (const def of COLUMNS) {
            if (columnState[def.key] === COLLAPSED) columnState[def.key] = EXPANDED;
          }
          persisted?.store.write("kanban.columns", columnState);
          ctx.rerender();
        },
      }, "EXPAND ALL"),
    );
  },

  mount(ctx) {
    return build(ctx);
  },

  update(root, ctx) {
    const fresh = build(ctx);
    root.replaceChildren(...fresh.childNodes);
  },

  destroy() {
    for (const list of lists) list.destroy();
    lists.length = 0;
  },
};
