import { el } from "../lib/dom.js";
import { dayDate, dayLabel, daysAgo, num, statusLabel } from "../lib/format.js";

const SHOW_MODES = [
  ["all", "All activity"],
  ["recent", "Status changes"],
  ["done", "Completions"],
];

let show = "all";
let limit = 400;

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

function entryNode(entry, ctx) {
  const task = entry.task;
  const colour = `var(--st-${task.status})`;
  const newest = task.lastActivity === entry.date;

  return el("div.entry", { onclick: () => ctx.openTask(task.id) },
    el("div.entry-rail", null,
      el("span.badge", {
        style: newest
          ? { color: colour, borderColor: colour, background: "transparent" }
          : { color: "var(--faint)", borderColor: "var(--line)" },
      }, newest ? statusLabel(task.status) : "NOTE"),
    ),
    el("div.entry-spine", null,
      el("i", {
        style: newest
          ? { background: colour, borderColor: colour }
          : { background: "var(--bg)", borderColor: "#3d3a33" },
      }),
      el("u"),
    ),
    el("div.entry-body", null,
      el("div.entry-head", null,
        el("span.entry-n", null, task.number),
        el("span.entry-title", null, task.title),
        el("span.entry-area", null, task.area || ""),
      ),
      el("div.entry-note", null, entry.text || "(no text)"),
      el("div.entry-foot", null,
        el("span.entry-agent", null, entry.agent || task.agent),
      ),
    ),
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
  const groups = new Map();
  for (const note of shown) {
    if (!groups.has(note.date)) groups.set(note.date, []);
    groups.get(note.date).push(note);
  }

  // Day totals come from the unfiltered set so the header count stays honest
  // about how much happened that day, not just how much survived the filter.
  const dayTotals = new Map();
  for (const note of ctx.allNotes) {
    dayTotals.set(note.date, (dayTotals.get(note.date) || 0) + 1);
  }

  for (const [date, entries] of groups) {
    const tasks = new Set(entries.map((e) => e.task.id)).size;
    const total = dayTotals.get(date) || entries.length;
    const label = dayLabel(date);

    // Native append() stringifies an array, so the entries are spread.
    inner.append(
      el("div.day-head", null,
        el("div.day-label" + (label === "TODAY" ? ".hot" : ""), null, label),
        el("span.day-date", null, dayDate(date)),
        el("div.day-rule"),
        el("span.day-meta", null,
          `${num(entries.length)}${entries.length === total ? "" : ` of ${num(total)}`} notes · ${num(tasks)} tasks`),
      ),
      ...entries.map((entry) => entryNode(entry, ctx)),
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
  filters: ["search", "area"],

  toolbar(ctx) {
    return el("div", { style: { display: "flex", alignItems: "center", gap: "14px" } },
      sparkline(ctx.allNotes),
      el("div.rail-div"),
      el("span.rail-label", null, "SHOW"),
      el("div.seg.tight", null,
        SHOW_MODES.map(([mode, label]) =>
          el("button.seg-item" + (show === mode ? ".on" : ""), {
            onclick: () => { show = mode; limit = 400; ctx.rerender(); },
          }, label),
        ),
      ),
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
