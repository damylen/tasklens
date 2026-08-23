import { el } from "../lib/dom.js";
import { num } from "../lib/format.js";

const HOUR = 3600e3;
const HOME_LIMIT = 14;

function active(backlog) {
  return [...backlog.tasks.values()].filter((task) => task.status === "in_progress" && task.mtime >= Date.now() - HOUR).length;
}

/** Home has a compact activity stream, never a cross-project task graph. */
export function recentEntries(backlog, limit = HOME_LIMIT) {
  const entries = [];
  for (const task of backlog.tasks.values()) {
    for (const note of task.notes) entries.push({ task, note });
  }
  return entries.sort((a, b) => b.note.date.localeCompare(a.note.date) || b.task.mtime - a.task.mtime).slice(0, limit);
}

function activityEntry({ task, note }) {
  const colour = `var(--st-${task.status})`;
  return el("div.project-activity", { title: `${task.number} · ${task.title}` },
    el("span.project-activity-dot", { style: { background: colour } }),
    el("div.project-activity-copy", null,
      el("div.project-activity-head", null,
        el("span.project-activity-number", null, task.number),
        el("span.project-activity-title", null, task.title),
      ),
      el("div.project-activity-note", null, note.text || "(no note text)"),
      el("div.project-activity-meta", null, note.date, " · ", note.agent || task.agent),
    ),
  );
}

function activityPlane(backlog, open) {
  const entries = recentEntries(backlog);
  const { counts } = backlog.meta;
  return el("section.project-plane", null,
    el("button.project-plane-head", { onclick: () => open(backlog.id, "timeline") },
      el("div", null,
        el("div.project-plane-kicker", null, "TIMELINE"),
        el("div.project-plane-name", null, backlog.label),
        el("div.project-plane-path", { title: backlog.dir }, backlog.dir),
      ),
      el("div.project-plane-total", null, num(backlog.meta.total), el("span", null, " tasks")),
    ),
    el("div.status-strip.project-plane-status", null,
      ["wishlist", "open", "in_progress", "blocked", "done"].map((status) =>
        counts[status] ? el("span", { style: { flex: `${counts[status]} 1 0`, background: `var(--st-${status})` } }) : null,
      ),
    ),
    el("div.project-plane-summary", null,
      el("span", { style: { color: "var(--st-in_progress)" } }, `${active(backlog)} active · 1h`),
      el("span", null, `${counts.blocked} blocked`),
      counts.wishlist ? el("span", { style: { color: "var(--st-wishlist)" } }, `${counts.wishlist} wishlist`) : null,
    ),
    el("div.project-activity-list", null,
      entries.length
        ? entries.map(activityEntry)
        : el("div.project-activity-empty", null, "NO AGENT NOTES YET"),
    ),
    el("button.project-plane-foot", { onclick: () => open(backlog.id, "timeline") },
      "OPEN TIMELINE", el("span", null, "→"),
    ),
  );
}

export function renderOverview(backlogs, open, add) {
  const total = backlogs.reduce((sum, backlog) => sum + backlog.meta.total, 0);
  const activeCount = backlogs.reduce((sum, backlog) => sum + active(backlog), 0);
  return el("div.overview", null,
    el("div.overview-head", null,
      el("div", null,
        el("div.overview-kicker", null, "WORKSPACE ACTIVITY"),
        el("div.overview-title", null, `${num(total)} tasks · ${backlogs.length} project${backlogs.length === 1 ? "" : "s"}`),
      ),
      el("div.active-work", { title: `${activeCount} in-progress tasks touched in the last hour` },
        el("span.active-work-dot"), el("span.active-work-count", null, num(activeCount)),
        el("span.active-work-label", null, "ACTIVE · 1H"),
      ),
    ),
    el("div.project-planes", null, backlogs.map((backlog) => activityPlane(backlog, open))),
    addBacklogForm(add),
  );
}

function addBacklogForm(add) {
  const label = el("input", { type: "text", placeholder: "Name, e.g. client", required: true });
  const dir = el("input", { type: "text", placeholder: "/path/to/project or TASKS", required: true });
  const notice = el("div.backlog-add-notice");
  const submit = el("button.chip.on", { type: "submit" }, "ADD PROJECT");
  return el("form.backlog-add", {
    onsubmit: async (event) => {
      event.preventDefault();
      notice.textContent = "Adding and scanning…";
      notice.className = "backlog-add-notice";
      submit.disabled = true;
      try { await add(label.value, dir.value); }
      catch (error) {
        notice.textContent = error.message || "Could not add this project";
        notice.className = "backlog-add-notice error";
        submit.disabled = false;
      }
    },
  }, el("div.backlog-add-title", null, "ADD PROJECT"), label, dir, submit, notice);
}
