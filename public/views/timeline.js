import { el, svg, ICON } from "../lib/dom.js";
import { dayDate, dayLabel, daysAgo, num, statusLabel } from "../lib/format.js";
import { areaLabel } from "../lib/area.js";
import { groupTimelineNotes, timelineStateStore, updateCollapsedGroups } from "../lib/timeline.js";

const SHOW_MODES = [
  ["all", "All activity"],
  ["recent", "Status changes"],
  ["done", "Completions"],
];

let show = "all";
let limit = 400;
let collapsed = new Set();
let persisted = null;

function ensureStore(ctx) {
  const root = ctx.meta?.root || "";
  persisted = { root, store: timelineStateStore(root, ctx.persist) };
  const saved = persisted.store.read("timeline.collapsed", []);
  collapsed = new Set(Array.isArray(saved) ? saved.filter((key) => typeof key === "string") : []);
}

function setGroupCollapsed(key, value, ctx) {
  ensureStore(ctx);
  if (value) collapsed.add(key);
  else collapsed.delete(key);
  persisted.store.write("timeline.collapsed", [...collapsed].sort());
  ctx.rerender();
}

/**
 * A note is only evidence that something happened on a date. Whether that
 * something was a status change is not recorded in the file, so "status
 * changes" is approximated from the task's current status plus the note being
 * its newest — and the UI says so rather than implying the file stores it.
 */
function keep(entry) {
  if (show === "all") return true;
  const newest = entry.task.lastActivity === entry.date;
  if (show === "done") return newest && entry.task.status === "done";
  return newest;
}

function noteNode(entry, task, ctx) {
  return el("button.timeline-note", { onclick: () => ctx.openTask(task.id), title: `Open ${task.number} ${task.title}` },
    el("div.timeline-note-rail", null),
    el("div.entry-spine", null,
      el("i", { style: { background: "var(--bg)", borderColor: "var(--line)" } }),
      el("u"),
    ),
    el("div.entry-body", null,
      el("div.entry-note", null, entry.text || "(no text)"),
      el("div.entry-foot", null,
        el("span.entry-agent", null, entry.agent || task.agent),
      ),
    ),
  );
}

function taskGroupNode(group, date, ctx) {
  const task = group.task;
  const colour = `var(--st-${task.status})`;
  const newest = task.lastActivity === date;
  const open = !collapsed.has(group.key);
  const bodyId = `timeline-${group.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  return el("section.timeline-task", null,
    el("div.timeline-task-head", null,
      el("button.timeline-task-toggle" + (open ? "" : ".closed"), {
        title: `${open ? "Collapse" : "Expand"} ${task.number} ${task.title}`,
        "aria-label": `${open ? "Collapse" : "Expand"} task ${task.number}`,
        "aria-expanded": open,
        "aria-controls": bodyId,
        onclick: () => setGroupCollapsed(group.key, open, ctx),
      }, svg(ICON.chevronDown, { size: 13, stroke: "currentColor" })),
      el("span.badge", {
        style: newest
          ? { color: colour, borderColor: colour, background: "transparent" }
          : { color: "var(--faint)", borderColor: "var(--line)" },
      }, newest ? statusLabel(task.status) : "NOTE"),
      el("button.timeline-task-link", {
        onclick: () => ctx.openTask(task.id),
        title: `Open ${task.number} ${task.title}`,
      },
        el("span.entry-n", null, task.number),
        el("span.entry-title", null, task.title),
      ),
      areaLabel(task, ctx, { className: "entry-area" }),
      el("span.timeline-task-meta", null, `${num(group.notes.length)} note${group.notes.length === 1 ? "" : "s"}`),
    ),
    el("div.timeline-task-notes", { id: bodyId, hidden: !open }, group.notes.map((note) => noteNode(note, task, ctx))),
  );
}

function sparkline(notes) {
  const buckets = new Map();
  for (const note of notes) {
    const days = daysAgo(note.date);
    if (days == null || days < 0 || days > 13) continue;
    buckets.set(days, (buckets.get(days) || 0) + 1);
  }
  const series = [];
  for (let d = 13; d >= 0; d--) series.push(buckets.get(d) || 0);
  const peak = Math.max(1, ...series);

  return el("div", { style: { display: "flex", alignItems: "center", gap: "10px" } },
    el("span.rail-label", null, "NOTES / DAY · 14D"),
    el("div.spark", null,
      series.map((count, i) =>
        el("i" + (i >= series.length - 2 ? ".hot" : ""), {
          style: { height: `${Math.max(2, Math.round((count / peak) * 22))}px` },
          title: `${count} notes`,
        }),
      ),
    ),
    el("span", { class: "mono", style: { fontSize: "10px", color: "var(--faint)" } }, `peak ${peak}`),
  );
}

function build(ctx) {
  ensureStore(ctx);
  const notes = ctx.notes.filter(keep);
  const stream = el("div.stream");
  const inner = el("div.stream-in");
  stream.append(inner);

  if (!notes.length) {
    inner.append(el("div.empty", null,
      el("div.big", null, "No activity matches these filters"),
      el("div.small", null, "clear the filters, or widen the Show control"),
    ));
    return stream;
  }

  const shown = notes.slice(0, limit);
  const groups = groupTimelineNotes(shown);

  // Day totals come from the unfiltered set so the header count stays honest
  // about how much happened that day, not just how much survived the filter.
  const dayTotals = new Map();
  for (const note of ctx.allNotes) {
    dayTotals.set(note.date, (dayTotals.get(note.date) || 0) + 1);
  }

  for (const group of groups) {
    const { date, tasks } = group;
    const entries = tasks.flatMap((task) => task.notes);
    const total = dayTotals.get(date) || entries.length;
    const label = dayLabel(date);

    // Native append() stringifies an array, so the entries are spread.
    inner.append(
      el("div.day-head", null,
        el("div.day-label" + (label === "TODAY" ? ".hot" : ""), null, label),
        el("span.day-date", null, dayDate(date)),
        el("div.day-rule"),
        el("span.day-meta", null,
          `${num(entries.length)}${entries.length === total ? "" : ` of ${num(total)}`} notes · ${num(tasks.length)} tasks`),
      ),
      ...tasks.map((task) => taskGroupNode(task, date, ctx)),
    );
  }

  if (notes.length > shown.length) {
    inner.append(
      el("div", { style: { display: "flex", justifyContent: "center", padding: "20px 0 0" } },
        el("button.chip", {
          onclick: () => { limit += 400; ctx.rerender(); },
        }, `SHOW MORE · ${num(notes.length - shown.length)} OLDER NOTES`),
      ),
    );
  }

  return stream;
}

export default {
  id: "timeline",
  label: "Timeline",
  filters: ["search", "status", "area"],

  detailBar(ctx) {
    return sparkline(ctx.allNotes);
  },

  toolbar(ctx) {
    ensureStore(ctx);
    const keys = groupTimelineNotes(ctx.notes.filter(keep).slice(0, limit))
      .flatMap((day) => day.tasks.map((task) => task.key));
    const allCollapsed = keys.length > 0 && keys.every((key) => collapsed.has(key));
    return el("div", { style: { display: "flex", alignItems: "center", gap: "14px" } },
      el("span.rail-label", null, "SHOW"),
      el("div.seg.tight", null,
        SHOW_MODES.map(([mode, label]) =>
          el("button.seg-item" + (show === mode ? ".on" : ""), {
            onclick: () => { show = mode; limit = 400; ctx.rerender(); },
          }, label),
        ),
      ),
      el("div.rail-div"),
      el("button.chip.tiny", {
        disabled: keys.length === 0,
        onclick: () => {
          collapsed = updateCollapsedGroups(collapsed, keys, !allCollapsed);
          persisted.store.write("timeline.collapsed", [...collapsed].sort());
          ctx.rerender();
        },
      }, allCollapsed ? "EXPAND ALL" : "COLLAPSE ALL"),
    );
  },

  mount(ctx) {
    return build(ctx);
  },

  update(root, ctx) {
    const scroller = root.scrollTop;
    const fresh = build(ctx);
    root.replaceChildren(...fresh.childNodes);
    root.scrollTop = scroller;
  },
};
