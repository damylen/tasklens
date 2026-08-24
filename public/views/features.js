import { el } from "../lib/dom.js";
import { ago, statusLabel } from "../lib/format.js";

const STATUS_ORDER = ["in_progress", "blocked", "open", "wishlist", "done"];

export function featureGroups(tasks) {
  const groups = new Map();
  for (const task of tasks) {
    for (const id of task.features || []) {
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(task);
    }
  }
  return [...groups.entries()]
    .map(([id, linked]) => ({
      id,
      tasks: linked.sort((a, b) =>
        STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
        || (b.lastActivity || "").localeCompare(a.lastActivity || "")
        || a.num - b.num),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function taskRow(task, ctx) {
  const colour = `var(--st-${task.status})`;
  return el("button.feature-task", { onclick: () => ctx.openTask(task.id) },
    el("span.hair", { style: { background: colour } }),
    el("span.n", null, task.number),
    el("span.t", { title: task.title }, task.title),
    el("span.badge", { style: { color: colour, borderColor: colour } }, statusLabel(task.status)),
    el("span.ago", null, ago(task.lastActivity)),
  );
}

function featureCard(group, ctx) {
  const operational = group.tasks.filter((task) => task.status !== "done" && task.status !== "wishlist").length;
  return el("section.feature-card", null,
    el("button.feature-head", { onclick: () => ctx.goFeature(group.id), title: `Focus ${group.id}` },
      el("div", null,
        el("div.feature-kicker", null, "PRODUCT FEATURE"),
        el("div.feature-id", null, group.id),
      ),
      el("div.feature-count", null, String(group.tasks.length), el("span", null, " TASKS")),
    ),
    el("div.feature-summary", null,
      el("span", null, `${operational} active`),
      el("span", null, `${group.tasks.length - operational} parked or done`),
    ),
    el("div.feature-task-list", null, group.tasks.map((task) => taskRow(task, ctx))),
  );
}

function build(ctx) {
  const selected = ctx.param ? decodeURIComponent(ctx.param) : null;
  const groups = featureGroups(ctx.tasks).filter((group) => !selected || group.id === selected);
  if (!groups.length) {
    return el("div.empty", null,
      el("div.big", null, selected ? "NO MATCHING FEATURE TASKS" : "NO FEATURE LINKS YET"),
      el("div.small", null, selected
        ? "CLEAR OR CHANGE THE CURRENT FILTERS"
        : "ADD AN OPTIONAL FEATURES: FIELD TO A TASK; EXISTING BACKLOGS NEED NO MIGRATION"),
    );
  }
  return el("div.feature-view", null,
    selected ? el("div.feature-focus", null,
      el("span", null, "FEATURE"),
      el("strong", null, selected),
      el("button.chip.tiny", { onclick: () => ctx.goView("features") }, "SHOW ALL"),
    ) : null,
    el("div.feature-grid", null, groups.map((group) => featureCard(group, ctx))),
  );
}

export default {
  id: "features",
  label: "Features",
  filters: ["search", "priority", "area"],
  mount: build,
  update(root, ctx) { root.replaceWith(build(ctx)); },
};
