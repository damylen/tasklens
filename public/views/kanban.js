import { el, clear, svg, ICON } from "../lib/dom.js";
import { ago, num, statusLabel } from "../lib/format.js";
import { virtualList } from "../lib/virtual.js";

const COLUMNS = [
  { key: "open", label: "OPEN" },
  { key: "in_progress", label: "IN PROGRESS" },
  { key: "blocked", label: "BLOCKED" },
  { key: "done", label: "DONE" },
];

const CARD_H = 96;
const GAP = 7;
const DONE_MODES = [
  ["list", "List"],
  ["rail", "Rail"],
  ["hidden", "Hide"],
];

let doneMode = "list";
const lists = [];

function card(task, ctx) {
  const colour = `var(--st-${task.status})`;
  const fresh = ctx.store.isFresh(task.id);

  return el("div.card" + (fresh ? ".fresh" : ""), { onclick: () => ctx.openTask(task.id) },
    el("div.card-hair", { style: { background: colour } }),
    el("div.card-in", null,
      el("div.card-top", null,
        el("span.card-n", { title: task.duplicateNumber ? `number ${task.number} is shared with another file` : null },
          task.number + (task.duplicateNumber ? "*" : "")),
        el("span.pill", {
          style: { color: `var(--pr-${task.priority})`, borderColor: `var(--pr-${task.priority})` },
        }, task.priority.toUpperCase()),
        el("div.grow"),
        fresh ? el("span.freshdot") : null,
        el("span.card-ago", null, ago(task.lastActivity)),
      ),
      el("div.card-title", { title: task.title }, task.title),
      el("div.card-foot", null,
        el("span.card-area", { title: task.area }, task.area || "—"),
        el("span.card-agent", null, task.agent),
      ),
    ),
  );
}

function column(def, tasks, ctx, totals) {
  const colour = `var(--st-${def.key})`;
  const isDone = def.key === "done";

  if (isDone && doneMode === "rail") {
    const node = el("div.col.rail-mode", { onclick: () => { doneMode = "list"; ctx.rerender(); } },
      el("div.railcol", null,
        el("span.dot", { style: { background: colour } }),
        el("span.railcol-n", { style: { color: colour } }, num(tasks.length)),
        el("div.railcol-l", null, def.label),
      ),
    );
    return node;
  }

  const share = Math.max(2, Math.round((tasks.length / Math.max(1, totals)) * 100));
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

  // Only the big column earns a footer; the rest would just be noise.
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
  const board = el("div.board");
  const total = ctx.tasks.length;

  for (const def of COLUMNS) {
    if (def.key === "done" && doneMode === "hidden") continue;
    const tasks = ctx.tasks
      .filter((t) => t.status === def.key)
      .sort((a, b) => {
        const left = a.lastActivity || "";
        const right = b.lastActivity || "";
        return right.localeCompare(left) || a.num - b.num;
      });
    board.append(column(def, tasks, ctx, total));
  }
  return board;
}

export default {
  id: "kanban",
  label: "Kanban",
  filters: ["search", "priority", "area"],

  toolbar(ctx) {
    const wrap = el("div", { style: { display: "flex", alignItems: "center", gap: "14px" } },
      el("span.rail-label", null, "DONE COLUMN"),
      el("div.seg.tight", null,
        DONE_MODES.map(([mode, label]) =>
          el("button.seg-item" + (doneMode === mode ? ".on" : ""), {
            onclick: () => { doneMode = mode; ctx.rerender(); },
          }, label),
        ),
      ),
    );
    return wrap;
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
