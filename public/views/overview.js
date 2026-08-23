import { el } from "../lib/dom.js";
import { num } from "../lib/format.js";

const HOUR = 3600e3;

function active(backlog) {
  return [...backlog.tasks.values()].filter((task) => task.status === "in_progress" && task.mtime >= Date.now() - HOUR).length;
}

export function renderOverview(backlogs, open) {
  const total = backlogs.reduce((sum, backlog) => sum + backlog.meta.total, 0);
  const activeCount = backlogs.reduce((sum, backlog) => sum + active(backlog), 0);
  return el("div.overview", null,
    el("div.overview-head", null,
      el("div", null,
        el("div.overview-kicker", null, "WORKSPACE OVERVIEW"),
        el("div.overview-title", null, `${num(total)} tasks across ${backlogs.length} backlog${backlogs.length === 1 ? "" : "s"}`),
      ),
      el("div.active-work", { title: `${activeCount} in-progress tasks touched in the last hour` },
        el("span.active-work-dot"), el("span.active-work-count", null, num(activeCount)),
        el("span.active-work-label", null, "ACTIVE · 1H"),
      ),
    ),
    el("div.overview-grid", null,
      backlogs.map((backlog) => {
        const { counts } = backlog.meta;
        return el("button.backlog-card", { onclick: () => open(backlog.id) },
          el("div.backlog-card-head", null,
            el("div", null, el("div.backlog-card-name", null, backlog.label), el("div.backlog-card-path", { title: backlog.dir }, backlog.dir)),
            el("span.live " + (backlog.id ? "on" : "off")),
          ),
          el("div.backlog-total", null, num(backlog.meta.total), el("span", null, " tasks")),
          el("div.status-strip", null,
            ["open", "in_progress", "blocked", "done"].map((status) =>
              counts[status] ? el("span", { style: { flex: `${counts[status]} 1 0`, background: `var(--st-${status})` } }) : null,
            ),
          ),
          el("div.backlog-card-foot", null,
            el("span", { style: { color: "var(--st-in_progress)" } }, `${active(backlog)} active · 1h`),
            el("span", null, `${counts.blocked} blocked`),
          ),
        );
      }),
    ),
  );
}
