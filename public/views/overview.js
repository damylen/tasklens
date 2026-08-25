import { el, svg, ICON } from "../lib/dom.js";
import { dayDate, dayLabel, num } from "../lib/format.js";
import { activeWorkCount, isActiveWorkTask } from "../lib/activity.js";
import { groupTimelineNotes, timelineStateStore, updateCollapsedGroups } from "../lib/timeline.js";

const HOME_LIMIT = 14;

export function createAddBacklogFormState() {
  return { label: "", dir: "", pending: false, error: "" };
}

const defaultAddBacklogState = createAddBacklogFormState();

export function captureAddBacklogFocus(root) {
  const active = document.activeElement;
  if (!active || !root?.contains?.(active)) return null;
  const field = active.getAttribute?.("data-backlog-field");
  if (field !== "label" && field !== "dir") return null;
  return {
    field,
    start: active.selectionStart,
    end: active.selectionEnd,
    direction: active.selectionDirection,
  };
}

export function restoreAddBacklogFocus(root, focus) {
  if (!focus || (focus.field !== "label" && focus.field !== "dir")) return;
  const input = root?.querySelector?.(`[data-backlog-field="${focus.field}"]`);
  if (!input || input.disabled) return;
  input.focus({ preventScroll: true });
  if (typeof focus.start === "number" && typeof focus.end === "number") {
    input.setSelectionRange(focus.start, focus.end, focus.direction || "none");
  }
}

function active(backlog) {
  return activeWorkCount([...backlog.tasks.values()]);
}

/** Home has a compact activity stream, never a cross-project task graph. */
export function recentEntries(backlog, limit = HOME_LIMIT, activeOnly = false) {
  const entries = [];
  for (const task of backlog.tasks.values()) {
    if (activeOnly && !isActiveWorkTask(task)) continue;
    for (const note of task.notes) entries.push({ task, note });
  }
  return entries.sort((a, b) => b.note.date.localeCompare(a.note.date) || b.task.mtime - a.task.mtime).slice(0, limit);
}

export function recentGroups(backlog, limit = HOME_LIMIT, activeOnly = false) {
  return groupTimelineNotes(recentEntries(backlog, limit, activeOnly)
    .map(({ task, note }) => ({ ...note, task })));
}

function projectTaskGroup(backlog, group, openProject, rerender, collapsed, stateStore) {
  const task = group.task;
  const open = !collapsed.has(group.key);
  const bodyId = `home-${backlog.id}-${group.key}`.replace(/[^a-zA-Z0-9_-]/g, "-");
  const setCollapsed = () => {
    if (open) collapsed.add(group.key);
    else collapsed.delete(group.key);
    stateStore.write("timeline.collapsed", [...collapsed].sort());
    rerender();
  };

  return el("section.project-task", null,
    el("div.project-task-head", null,
      el("button.project-task-toggle" + (open ? "" : ".closed"), {
        title: `${open ? "Collapse" : "Expand"} ${task.number} ${task.title}`,
        "aria-label": `${open ? "Collapse" : "Expand"} task ${task.number}`,
        "aria-expanded": open,
        "aria-controls": bodyId,
        onclick: setCollapsed,
      }, svg(ICON.chevronDown, { size: 12, stroke: "currentColor" })),
      el("span.project-activity-dot", { style: { background: `var(--st-${task.status})` } }),
      el("button.project-task-link", {
        title: `Open ${task.number} ${task.title}`,
        onclick: () => openProject(backlog.id, "task", task.id),
      },
        el("span.project-activity-number", null, task.number),
        el("span.project-activity-title", null, task.title),
      ),
      el("span.project-task-count", null, num(group.notes.length)),
    ),
    el("div.project-task-notes", { id: bodyId, hidden: !open },
      group.notes.map((note) => el("div.project-task-note", null,
        el("div.project-activity-note", null, note.text || "(no note text)"),
        el("div.project-activity-meta", null, note.agent || task.agent),
      )),
    ),
  );
}

function projectActivity(backlog, groups, openProject, rerender, emptyLabel) {
  if (!groups.length) return el("div.project-activity-empty", null, emptyLabel);
  const stateStore = timelineStateStore(backlog.meta.root);
  const saved = stateStore.read("timeline.collapsed", []);
  let collapsed = new Set(Array.isArray(saved) ? saved.filter((key) => typeof key === "string") : []);
  const keys = groups.flatMap((day) => day.tasks.map((task) => task.key));
  const allCollapsed = keys.length > 0 && keys.every((key) => collapsed.has(key));

  return [
    el("div.project-activity-tools", null,
      el("span", null, `${num(keys.length)} TASK${keys.length === 1 ? "" : "S"}`),
      el("button", {
        onclick: () => {
          collapsed = updateCollapsedGroups(collapsed, keys, !allCollapsed);
          stateStore.write("timeline.collapsed", [...collapsed].sort());
          rerender();
        },
      }, allCollapsed ? "EXPAND ALL" : "COLLAPSE ALL"),
    ),
    groups.map((day) => el("div.project-day", null,
      el("div.project-day-head", null,
        el("span", null, dayLabel(day.date)),
        el("time", { datetime: day.date }, dayDate(day.date)),
      ),
      day.tasks.map((group) => projectTaskGroup(backlog, group, openProject, rerender, collapsed, stateStore)),
    )),
  ];
}

function activityPlane(backlog, open, activeOnly = false, rerender = () => {}) {
  const groups = recentGroups(backlog, HOME_LIMIT, activeOnly);
  const { counts } = backlog.meta;
  const activeCount = active(backlog);
  return el("section.project-plane", null,
    el("button.project-plane-head", { onclick: () => open(backlog.id, "timeline") },
      el("div", null,
        el("div.project-plane-kicker", null, "TIMELINE"),
        el("div.project-plane-name", null, backlog.label),
        el("div.project-plane-path", { title: backlog.dir }, backlog.dir),
      ),
      el("div.project-plane-total", null,
        num(activeOnly ? activeCount : backlog.meta.total),
        el("span", null, activeOnly ? " active" : " tasks"),
      ),
    ),
    el("div.status-strip.project-plane-status", null,
      activeOnly
        ? el("span", { style: { flex: "1", background: "var(--st-in_progress)" } })
        : ["wishlist", "open", "in_progress", "blocked", "done"].map((status) =>
          counts[status] ? el("span", { style: { flex: `${counts[status]} 1 0`, background: `var(--st-${status})` } }) : null,
        ),
    ),
    el("div.project-plane-summary", null,
      activeOnly
        ? el("span", { style: { color: "var(--st-in_progress)" } }, "IN PROGRESS · TOUCHED 1H")
        : [
          el("span", { style: { color: "var(--st-in_progress)" } }, `${activeCount} active · 1h`),
          el("span", null, `${counts.blocked} blocked`),
          counts.wishlist ? el("span", { style: { color: "var(--st-wishlist)" } }, `${counts.wishlist} wishlist`) : null,
        ],
    ),
    el("div.project-activity-list", null,
      projectActivity(
        backlog,
        groups,
        open,
        rerender,
        activeOnly ? "NO NOTES ON ACTIVE TASKS" : "NO AGENT NOTES YET",
      ),
    ),
    el("button.project-plane-foot", { onclick: () => open(backlog.id, "timeline") },
      "OPEN TIMELINE", el("span", null, "→"),
    ),
  );
}

export function renderOverview(
  backlogs,
  open,
  add,
  rerender = () => {},
  addBacklogState = defaultAddBacklogState,
  overviewState = {},
) {
  const total = backlogs.reduce((sum, backlog) => sum + backlog.meta.total, 0);
  const activeCount = backlogs.reduce((sum, backlog) => sum + active(backlog), 0);
  const activeOnly = overviewState.activeOnly === true;
  const visibleBacklogs = activeOnly ? backlogs.filter((backlog) => active(backlog) > 0) : backlogs;
  return el("div.overview", null,
    el("div.overview-head", null,
      el("div", null,
        el("div.overview-kicker", null, "WORKSPACE ACTIVITY"),
        el("div.overview-title", null, activeOnly
          ? `${num(activeCount)} active task${activeCount === 1 ? "" : "s"} · ${visibleBacklogs.length} project${visibleBacklogs.length === 1 ? "" : "s"}`
          : `${num(total)} tasks · ${backlogs.length} project${backlogs.length === 1 ? "" : "s"}`),
      ),
      el("button.active-work" + (activeOnly ? ".on" : ""), {
        type: "button",
        title: activeOnly ? "show all workspace activity" : `${activeCount} in-progress tasks touched in the last hour · show only active`,
        "aria-pressed": String(activeOnly),
        onclick: () => overviewState.toggleActive?.(),
      },
        el("span.active-work-dot"), el("span.active-work-count", null, num(activeCount)),
        el("span.active-work-label", null, "ACTIVE · 1H"),
      ),
    ),
    visibleBacklogs.length
      ? el("div.project-planes", null, visibleBacklogs.map((backlog) => activityPlane(backlog, open, activeOnly, rerender)))
      : el("div.overview-active-empty", null, "NO ACTIVE TASKS TOUCHED IN THE LAST HOUR"),
    addBacklogForm(add, rerender, addBacklogState),
  );
}

function addBacklogForm(add, rerender, addBacklogState) {
  const label = el("input", {
    type: "text",
    placeholder: "Name, e.g. client",
    required: true,
    value: addBacklogState.label,
    disabled: addBacklogState.pending,
    "data-backlog-field": "label",
    oninput: (event) => { addBacklogState.label = event.target.value; },
  });
  const dir = el("input", {
    type: "text",
    placeholder: "/path/to/project or TASKS",
    required: true,
    value: addBacklogState.dir,
    disabled: addBacklogState.pending,
    "data-backlog-field": "dir",
    oninput: (event) => { addBacklogState.dir = event.target.value; },
  });
  const notice = el(
    `div.backlog-add-notice${addBacklogState.error ? ".error" : ""}`,
    null,
    addBacklogState.pending ? "Adding and scanning…" : addBacklogState.error,
  );
  const submit = el("button.chip.on", {
    type: "submit",
    disabled: addBacklogState.pending,
  }, "ADD PROJECT");
  return el("form.backlog-add", {
    onsubmit: async (event) => {
      event.preventDefault();
      if (addBacklogState.pending) return;
      addBacklogState.pending = true;
      addBacklogState.error = "";
      rerender();
      try {
        await add(addBacklogState.label, addBacklogState.dir);
        addBacklogState.label = "";
        addBacklogState.dir = "";
      }
      catch (error) {
        addBacklogState.error = error.message || "Could not add this project";
      } finally {
        addBacklogState.pending = false;
        rerender();
      }
    },
  }, el("div.backlog-add-title", null, "ADD PROJECT"), label, dir, submit, notice);
}
