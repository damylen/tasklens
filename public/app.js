import { el, clear, svg, ICON } from "./lib/dom.js";
import { normalizePriorities, priorityMatches, togglePriority } from "./lib/filters.js";
import { num } from "./lib/format.js";
import { isTypingTarget, resolveShortcut } from "./lib/shortcuts.js";
import { ClientStore } from "./lib/store.js";
import { activeWorkCount } from "./lib/activity.js";
import { createStore } from "./lib/persist.js";
import { allViews, defaultViewId, getView } from "./lib/registry.js";
import { renderDetail, detailCrumb, resetDetailState } from "./views/detail.js";
import {
  captureAddBacklogFocus,
  renderOverview,
  restoreAddBacklogFocus,
} from "./views/overview.js";
import "./views/index.js";

const store = new ClientStore();
const root = document.getElementById("app");

const filters = { q: "", priorities: [], area: "", since: 0, hideDone: false, hideWishlist: false };

/** One namespaced store shared by the chrome and every view. */
let persist = null;
let detailOpen = true;
let lastView = null;
let overviewActiveOnly = false;

function ensurePersist() {
  const root = store.meta?.root || "";
  if (persist && persist.root === root) return persist.store;
  persist = { root, store: createStore(root) };
  lastView = null;
  detailOpen = persist.store.read("chrome.detailBar", true) !== false;
  return persist.store;
}

/** Working state worth keeping. Search text is not: it is a momentary lookup,
 *  and restoring it would open onto a backlog that looks nearly empty. */
function saveFilters() {
  persist?.store.write("chrome.filters", {
    hideDone: filters.hideDone,
    hideWishlist: filters.hideWishlist,
    priorities: filters.priorities,
    area: filters.area,
    since: filters.since,
  });
}

function saveView(id) {
  if (!id || lastView === id) return;
  lastView = id;
  persist?.store.write("chrome.view", id);
}

/**
 * Restore once the tasks are in, because the stored values have to be checked
 * against them: an area whose group no longer exists, or a window no longer
 * offered, would otherwise restore a board that looks empty for no reason.
 */
function restoreState(tasks) {
  const store_ = ensurePersist();
  filters.hideDone = false;
  filters.hideWishlist = false;
  filters.priorities = [];
  filters.area = "";
  filters.since = 0;

  const saved = store_.read("chrome.filters", null);
  if (saved && typeof saved === "object") {
    filters.hideDone = saved.hideDone === true;
    filters.hideWishlist = saved.hideWishlist === true;
    filters.priorities = normalizePriorities(saved.priorities ?? saved.priority);
    if (SINCE_WINDOWS.some(([window]) => window === saved.since)) filters.since = saved.since;
    if (typeof saved.area === "string" && saved.area) {
      const known = new Set();
      for (const task of tasks) {
        for (const path of task.areaPaths) {
          const parts = path.split("/");
          for (let i = 1; i <= parts.length; i++) known.add(parts.slice(0, i).join("/"));
        }
      }
      const isOther = saved.area === OTHER || saved.area.endsWith(`/${OTHER}`);
      const prefix = isOther
        ? saved.area.slice(0, saved.area === OTHER ? 0 : -(OTHER.length + 1))
        : saved.area;
      if (isOther ? areaChildren(tasks, prefix).tailCount : known.has(prefix)) {
        filters.area = saved.area;
      }
    }
  }

  const view = store_.read("chrome.view", null);
  if (typeof view === "string" && getView(view)?.id === view) lastView = view;
}

function selectBacklog(id) {
  if (!store.select(id, false)) return false;
  if (persist?.root !== store.meta?.root) restoreState(store.list());
  return true;
}
let route = { kind: "overview", backlog: null };
let active = null;      // { view, node }
let searchInput = null;

/* ── routing ─────────────────────────────────────────────── */

function readHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const parts = raw.split("/").filter(Boolean).map(decodeURIComponent);
  if (!parts.length || parts[0] === "overview") return { kind: "overview", backlog: null };
  if (parts[0] === "b" && parts[1]) {
    const backlog = parts[1];
    if (parts[2] === "task" && parts[3]) return { kind: "task", backlog, key: parts[3] };
    if (parts[2] && getView(parts[2])?.id === parts[2]) return { kind: "view", backlog, id: parts[2], param: parts[3] || null };
    return { kind: "view", backlog, id: defaultViewId(), param: null };
  }
  const head = parts[0] || "";
  const tail = parts.slice(1).join("/");
  if (head === "task" && tail) return { kind: "task", backlog: null, key: tail };
  // A view may carry a parameter, e.g. #/files/src/app.ts, handed to it as ctx.param.
  if (head && getView(head)?.id === head) {
    return { kind: "view", backlog: null, id: head, param: tail || null };
  }
  return { kind: "overview", backlog: null };
}

function applyHash() {
  const next = readHash();
  if (next.backlog) selectBacklog(next.backlog);
  const changedKind = next.kind !== route.kind;
  const changedView = next.kind === "view" && (next.id !== route.id || next.param !== route.param || next.backlog !== route.backlog);
  if (next.kind === "task") resetDetailState();
  route = next;
  if (changedKind || changedView) teardown();
  render();
}

function navigate(hash) {
  if (location.hash === hash) applyHash();
  else location.hash = hash;
}

function openOverview(activeOnly = false) {
  overviewActiveOnly = activeOnly;
  navigate("#/overview");
}

function toggleOverviewActive() {
  overviewActiveOnly = route.kind === "overview" ? !overviewActiveOnly : true;
  showShortcutSwitch("A", overviewActiveOnly ? "ACTIVE ONLY" : "ALL ACTIVITY");
  if (route.kind === "overview") render();
  else navigate("#/overview");
}

function backlogHash(backlog, view = defaultViewId()) {
  return `#/b/${encodeURIComponent(backlog)}/${view}`;
}

function teardown() {
  if (active?.view?.destroy) active.view.destroy(active.node);
  active = null;
}

/* ── context handed to every view ────────────────────────── */

function buildContext() {
  const all = store.list();
  const query = filters.q.trim().toLowerCase();

  areaMatches.pool = all;
  const match = (task) => {
    if (!priorityMatches(task.priority, filters.priorities)) return false;
    if (!areaMatches(task, filters.area)) return false;
    if (!sinceMatches(task, filters.since)) return false;
    if (filters.hideDone && task.status === "done") return false;
    if (filters.hideWishlist && task.status === "wishlist") return false;
    if (query) {
      const hay = `${task.number} ${task.title} ${task.area} ${task.agent} ${task.id} ${(task.features || []).join(" ")}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  };

  const tasks = all.filter(match);
  const visible = new Set(tasks.map((t) => t.id));
  const allNotes = store.notes();

  return {
    tasks,
    allTasks: all,
    byId: new Map(all.map((t) => [t.id, t])),
    resolve: (number) => store.resolve(number),
    notes: allNotes.filter((n) => visible.has(n.task.id)),
    allNotes,
    filters,
    meta: store.meta,
    backlog: store.backlogs.get(store.activeBacklog),
    param: route.kind === "view" ? route.param : null,
    store,
    persist: ensurePersist(),
    setFilter(key, value) {
      filters[key] = value;
      saveFilters();
      render();
    },
    toggleArea(path) {
      filters.area = filters.area === path ? "" : path;
      saveFilters();
      render();
    },
    goView(id) {
      navigate(backlogHash(store.activeBacklog, id));
    },
    goFile(path) {
      navigate(`${backlogHash(store.activeBacklog, "files")}/${encodeURIComponent(path)}`);
    },
    goFeature(id) {
      navigate(`${backlogHash(store.activeBacklog, "features")}/${encodeURIComponent(id)}`);
    },
    openTask(id) {
      navigate(`#/b/${encodeURIComponent(store.activeBacklog)}/task/${encodeURIComponent(id)}`);
    },
    goBack() {
      navigate(backlogHash(store.activeBacklog, lastView || defaultViewId()));
    },
    rerender() {
      render();
    },
  };
}

/* ── chrome ──────────────────────────────────────────────── */

const OTHER = "__other__";

const HOUR = 3600e3;
const DAY = 24 * HOUR;

/**
 * Recency windows. These read file MTIME, not the dated Agent Notes: notes
 * carry a date and no clock time, so anything under a day can only come from
 * when the file itself was last written. The rail says TOUCHED for that reason.
 */
const SINCE_WINDOWS = [
  [0, "ALL"],
  [HOUR, "1h"],
  [4 * HOUR, "4h"],
  [8 * HOUR, "8h"],
  [DAY, "1d"],
  [2 * DAY, "2d"],
  [7 * DAY, "7d"],
  [30 * DAY, "1m"],
];

function sinceMatches(task, window) {
  if (!window) return true;
  return task.mtime >= Date.now() - window;
}

function updateTrayBadge(tasks) {
  const invoke = globalThis.__TAURI_INTERNALS__?.invoke;
  if (typeof invoke !== "function") return;
  invoke("update_tray_active_count", { count: activeWorkCount(tasks) }).catch(() => {});
}

const AREA_CHIP_LIMIT = 6;

/**
 * Areas form a shallow tree (`client` > `v2` > `dataview`), so the rail drills
 * one level at a time instead of laying 1000+ values out flat. `prefix` is the
 * currently selected path; the chips offered are its direct children.
 */
function areaChildren(tasks, prefix) {
  const depth = prefix ? prefix.split("/").length : 0;
  const counts = new Map();

  for (const task of tasks) {
    const seen = new Set();
    for (const path of task.areaPaths) {
      if (prefix && path !== prefix && !path.startsWith(prefix + "/")) continue;
      const segments = path.split("/");
      if (segments.length <= depth) continue;
      seen.add(segments.slice(0, depth + 1).join("/"));
    }
    for (const key of seen) counts.set(key, (counts.get(key) || 0) + 1);
  }

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const head = ranked.slice(0, AREA_CHIP_LIMIT);
  const tail = ranked.slice(AREA_CHIP_LIMIT);
  return { head, tailCount: tail.length, tailKeys: new Set(tail.map(([key]) => key)) };
}

function areaMatches(task, selected) {
  if (!selected) return true;
  if (selected.endsWith("/" + OTHER)) {
    const prefix = selected.slice(0, -(OTHER.length + 1));
    const { tailKeys } = areaChildren(areaMatches.pool || [], prefix);
    return task.areaPaths.some((path) => {
      const depth = prefix ? prefix.split("/").length : 0;
      const key = path.split("/").slice(0, depth + 1).join("/");
      return tailKeys.has(key);
    });
  }
  return task.areaPaths.some((path) => path === selected || path.startsWith(selected + "/"));
}

function topBar(ctx, view) {
  const meta = store.meta;
  const isTask = route.kind === "task";
  const task = isTask ? store.get(route.key) : null;
  const backlogs = store.listBacklogs();

  const bar = el("div.bar", null,
    el("button.brand", { type: "button", title: "workspace overview", onclick: () => openOverview(false) },
      svg([
        "M12 5a7 7 0 100 14 7 7 0 000-14z",
        "M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3",
      ], { size: 20, stroke: "var(--accent)", width: 1.6 }),
      el("span.brand-name", null, "tasklens"),
    ),
  );

  const selectBacklogFromToolbar = (event) => {
    const id = event.target.value;
    if (!id) return;
    selectBacklog(id);
    navigate(backlogHash(id, lastView || defaultViewId()));
  };

  bar.append(el("div.backlog-tabs", null,
    el("button.backlog-tab" + (route.kind === "overview" ? ".on" : ""), { onclick: () => openOverview(false) }, "OVERVIEW"),
    backlogs.map((backlog) =>
      el("button.backlog-tab" + (backlog.id === store.activeBacklog && route.kind !== "overview" ? ".on" : ""), {
        title: backlog.dir,
        onclick: () => {
          selectBacklog(backlog.id);
          navigate(backlogHash(backlog.id, lastView || defaultViewId()));
        },
      }, backlog.label),
    ),
  ));
  bar.append(el("select.toolbar-select.backlog-select", {
    "aria-label": "Select project",
    onchange: selectBacklogFromToolbar,
  },
    el("option", { value: "", disabled: true, selected: route.kind === "overview" }, "Select project…"),
    backlogs.map((backlog) => el("option", {
      value: backlog.id,
      selected: route.kind !== "overview" && backlog.id === store.activeBacklog,
    }, backlog.label)),
  ));

  if (isTask && task) {
    bar.append(detailCrumb(task, ctx));
  } else if (route.kind !== "overview") {
    bar.append(
      el("div.seg", null,
        allViews().map((v) =>
          el("button.seg-item" + (v.id === view?.id ? ".on" : ""), {
            onclick: () => navigate(backlogHash(store.activeBacklog, v.id)),
          }, v.label),
        ),
      ),
      el("select.toolbar-select.view-select", {
        "aria-label": "Select view",
        onchange: (event) => navigate(backlogHash(store.activeBacklog, event.target.value)),
      }, allViews().map((v) => el("option", {
        value: v.id,
        selected: v.id === view?.id,
      }, v.label))),
    );
  }

  bar.append(el("div.grow"));

  if (!isTask && route.kind !== "overview") {
    bar.append(
      el("div.since", { title: "file modification time — Agent Notes carry a date with no clock time, so anything under a day can only come from when the file was last written" },
        el("span.rail-label", null, "TOUCHED"),
        el("div.chips", null,
          SINCE_WINDOWS.map(([window, label]) =>
            el("button.chip.tiny" + (filters.since === window ? ".on" : ""), {
              onclick: () => ctx.setFilter("since", window),
            }, label),
          ),
        ),
        el("select.toolbar-select.since-select", {
          "aria-label": "Filter by touched time",
          onchange: (event) => ctx.setFilter("since", Number(event.target.value)),
        }, SINCE_WINDOWS.map(([window, label]) => el("option", {
          value: String(window),
          selected: window === filters.since,
        }, label))),
      ),
    );
  }

  if (!isTask && route.kind !== "overview" && view?.filters?.includes("search")) {
    const input = el("input", {
      type: "search",
      placeholder: `Search ${num(ctx.allTasks.length)} tasks`,
      value: filters.q,
      oninput: (e) => {
        filters.q = e.target.value;
        render({ keepFocus: true });
      },
    });
    searchInput = input;
    bar.append(el("div.search", null, svg(ICON.search, { size: 13, stroke: "var(--faint)" }), input));
  }

  if (meta && route.kind !== "overview") {
    const activeWork = activeWorkCount(ctx.allTasks);
    bar.append(
      el("button.active-work", {
        type: "button",
        title: `${activeWork} in-progress task${activeWork === 1 ? "" : "s"} touched in the last hour · show in Overview`,
        "aria-label": `${activeWork} in-progress tasks touched in the last hour`,
        onclick: toggleOverviewActive,
      },
        el("span.active-work-dot"),
        el("span.active-work-count", null, num(activeWork)),
        el("span.active-work-label", null, "ACTIVE · 1H"),
      ),
      el("div.counts", null,
        el("div", null, el("b", null, num(meta.total)), " tasks"),
        el("div", null,
          el("span.hot", null, num(meta.noteCount)), " notes",
        ),
      ),
    );
  }

  bar.append(el("button.toolbar-info", {
    type: "button",
    title: "About TaskLens and keyboard shortcuts",
    "aria-label": "TaskLens information and shortcuts",
    onclick: showInfoDialog,
  }, svg(ICON.info, { size: 16, stroke: "currentColor", width: 1.7 })));

  return bar;
}

function areaControl(ctx) {
  const selected = filters.area;
  const segments = selected ? selected.split("/") : [];
  const nodes = [el("span.rail-label", null, "AREA")];
  const row = el("div.chips");

  // Breadcrumb: each selected level is a chip that pops back to its parent.
  segments.forEach((segment, index) => {
    const upto = segments.slice(0, index + 1).join("/");
    const label = segment === OTHER ? "OTHER" : segment;
    row.append(el("button.chip.tiny.on", {
      title: `clear ${upto}`,
      onclick: () => ctx.setFilter("area", segments.slice(0, index).join("/")),
    }, `${label} ×`));
  });

  if (!selected.endsWith(OTHER)) {
    const { head, tailCount } = areaChildren(ctx.allTasks, selected);
    if (!segments.length) {
      row.append(el("button.chip.tiny" + (selected ? "" : ".on"), {
        onclick: () => ctx.setFilter("area", ""),
      }, "ALL"));
    }
    for (const [key, count] of head) {
      const leaf = key.split("/").pop();
      row.append(el("button.chip.tiny", {
        title: `${key} · ${count} tasks`,
        onclick: () => ctx.setFilter("area", key),
      }, `${leaf} ${count}`));
    }
    if (tailCount) {
      row.append(el("button.chip.tiny", {
        title: `${tailCount} smaller areas`,
        onclick: () => ctx.setFilter("area", selected ? `${selected}/${OTHER}` : OTHER),
      }, `OTHER (${tailCount})`));
    }
  }

  nodes.push(row);
  return nodes;
}

function filterRail(ctx, view) {
  const wanted = view?.filters || [];
  const toolbar = view?.toolbar ? view.toolbar(ctx) : null;
  const hasChips = wanted.includes("priority") || wanted.includes("area") || wanted.includes("status");
  if (!hasChips && !toolbar) return null;

  const rail = el("div.rail");

  if (wanted.includes("priority")) {
    const priorities = [
      ["all", "ALL"], ["critical", "CRITICAL"], ["high", "HIGH"], ["medium", "MEDIUM"], ["low", "LOW"],
    ];
    rail.append(
      el("span.rail-label", null, "PRIORITY"),
      el("div.chips.priority-chips", null, priorities.map(([value, label]) => {
        const selected = value === "all" ? filters.priorities.length === 0 : filters.priorities.includes(value);
        return el("button.chip.tiny" + (selected ? ".on" : ""), {
          title: value === "all" ? "show every priority" : `toggle ${label.toLowerCase()} priority`,
          "aria-pressed": String(selected),
          onclick: () => ctx.setFilter("priorities", togglePriority(filters.priorities, value)),
        }, label);
      })),
    );
  }

  if (wanted.includes("status")) {
    if (wanted.includes("priority")) rail.append(el("div.rail-div"));
    rail.append(
      el("button.chip.tiny" + (filters.hideDone ? ".on" : ""), {
        title: filters.hideDone ? "show done tasks again" : "take done tasks out of every view",
        onclick: () => ctx.setFilter("hideDone", !filters.hideDone),
      }, filters.hideDone ? "DONE HIDDEN" : "HIDE DONE"),
      el("button.chip.tiny" + (filters.hideWishlist ? ".on" : ""), {
        title: filters.hideWishlist ? "show wishlist tasks again" : "take wishlist tasks out of every view",
        onclick: () => ctx.setFilter("hideWishlist", !filters.hideWishlist),
      }, filters.hideWishlist ? "WISHLIST HIDDEN" : "HIDE WISHLIST"),
    );
  }

  if (wanted.includes("area")) {
    if (wanted.includes("priority") || wanted.includes("status")) rail.append(el("div.rail-div"));
    rail.append(...areaControl(ctx));
  }

  rail.append(el("div.grow"));
  if (toolbar) rail.append(toolbar);

  if (view?.detailBar) {
    rail.append(
      el("button.colbtn.detail-toggle", {
        title: detailOpen ? "hide the detail strip" : "show the detail strip",
        onclick: () => {
          detailOpen = !detailOpen;
          ensurePersist().write("chrome.detailBar", detailOpen);
          ctx.rerender();
        },
      }, svg(detailOpen ? ICON.chevronUp : ICON.chevronDown, { size: 14, stroke: "currentColor" })),
    );
  }
  return rail;
}

/**
 * The third chrome row. A view opts in with `detailBar(ctx)`; anything it
 * returns lives here instead of competing for space in the filter rail.
 */
function detailStrip(ctx, view) {
  const content = view.detailBar(ctx);
  if (!content) return null;
  return el("div.detailbar", null, content);
}

/* ── render ──────────────────────────────────────────────── */

function render(options = {}) {
  updateTrayBadge(store.listAll());
  if (route.kind === "overview") {
    const formFocus = captureAddBacklogFocus(root);
    clear(root);
    root.append(topBar({ allTasks: [], meta: null }, null));
    root.append(renderOverview(store.listBacklogs(), (backlog, view, taskId) => {
      selectBacklog(backlog);
      navigate(taskId
        ? `#/b/${encodeURIComponent(backlog)}/task/${encodeURIComponent(taskId)}`
        : backlogHash(backlog, view));
    }, (label, dir) => store.addBacklog(label, dir), render, undefined, {
      activeOnly: overviewActiveOnly,
      toggleActive: toggleOverviewActive,
    }));
    restoreAddBacklogFocus(root, formFocus);
    return;
  }

  if (route.backlog) selectBacklog(route.backlog);
  const ctx = buildContext();

  if (route.kind === "task") {
    const task = store.get(route.key);
    clear(root);
    root.append(topBar(ctx, null));
    if (!task) {
      root.append(el("div.empty", null,
        el("div.big", null, `Task ${route.key} is not in this backlog`),
        el("div.small", null, "it may have been renamed or removed"),
        el("button.chip", { onclick: () => ctx.goBack() }, "BACK TO THE BOARD"),
      ));
      return;
    }
    root.append(renderDetail(task, ctx));
    return;
  }

  const view = getView(route.id);
  if (!view) return;
  saveView(view.id);

  const bar = topBar(ctx, view);
  const rail = filterRail(ctx, view);
  const detail = detailOpen && view.detailBar ? detailStrip(ctx, view) : null;

  if (active?.view?.id === view.id && active.node.isConnected && view.update) {
    // Keep the view's DOM (and its scroll position) and swap only the chrome.
    // The chrome rows vary in number, so they are rebuilt as a block ahead of
    // the view node rather than replaced by index.
    while (root.firstChild && root.firstChild !== active.node) root.removeChild(root.firstChild);
    const head = [bar, rail, detail].filter(Boolean);
    for (const row of head) root.insertBefore(row, active.node);
    view.update(active.node, ctx);
  } else {
    teardown();
    const node = view.mount(ctx);
    active = { view, node };
    clear(root);
    root.append(bar);
    if (rail) root.append(rail);
    if (detail) root.append(detail);
    root.append(node);
  }

  if (options.keepFocus && searchInput) {
    const value = searchInput.value;
    searchInput.focus();
    searchInput.setSelectionRange(value.length, value.length);
  }
}

/* ── toast for live changes ──────────────────────────────── */

const toast = el("div.toast");
document.body.append(toast);
let toastTimer = null;

function flash(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

const shortcutSwitchKey = el("div.shortcut-switch-key");
const shortcutSwitchLabel = el("div.shortcut-switch-label");
const shortcutSwitch = el("div.shortcut-switch", { "aria-live": "polite" },
  el("div.shortcut-switch-card", null, shortcutSwitchKey, shortcutSwitchLabel),
);
document.body.append(shortcutSwitch);
let shortcutSwitchTimer = null;

function showShortcutSwitch(key, label) {
  shortcutSwitchKey.textContent = key;
  shortcutSwitchLabel.textContent = label;
  shortcutSwitch.classList.remove("show");
  // Restart the entrance animation when shortcuts are used in quick succession.
  void shortcutSwitch.offsetWidth;
  shortcutSwitch.classList.add("show");
  clearTimeout(shortcutSwitchTimer);
  shortcutSwitchTimer = setTimeout(() => shortcutSwitch.classList.remove("show"), 1050);
}

window.addEventListener("keydown", (event) => {
  if (event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
  if (infoDialog.open) return;
  if (isTypingTarget(event.target)) return;

  const action = resolveShortcut(event.key, store.listBacklogs());
  if (!action) return;

  if (action.type === "search") {
    if (!searchInput?.isConnected) return;
    event.preventDefault();
    searchInput.focus();
    searchInput.select();
    showShortcutSwitch(action.key, "SEARCH");
    return;
  }

  event.preventDefault();
  if (action.type === "overview") {
    overviewActiveOnly = false;
    showShortcutSwitch(action.key, "OVERVIEW");
    navigate("#/overview");
    return;
  }
  if (action.type === "active") {
    toggleOverviewActive();
    return;
  }
  if (action.type === "toggleDone") {
    if (route.kind !== "view") return;
    filters.hideDone = !filters.hideDone;
    saveFilters();
    render();
    showShortcutSwitch(action.key, filters.hideDone ? "DONE HIDDEN" : "DONE VISIBLE");
    return;
  }
  if (action.type === "project") {
    selectBacklog(action.backlog.id);
    showShortcutSwitch(action.key, `PROJECT · ${action.backlog.label}`);
    navigate(backlogHash(action.backlog.id, lastView || defaultViewId()));
    return;
  }
  if (action.type === "view" && store.activeBacklog) {
    const selectedView = getView(action.id);
    showShortcutSwitch(action.key, selectedView?.label?.toUpperCase() || action.id.toUpperCase());
    navigate(backlogHash(store.activeBacklog, action.id));
  }
});

const shortcutRows = [
  ["1–9", "Select project in displayed order"],
  ["T", "Timeline"], ["K", "Kanban"], ["G", "Groups"],
  ["F", "Files"], ["U", "Unreleased"], ["O", "Overview"],
  ["A", "Toggle active-only Overview"], ["D", "Toggle done tasks"], ["/", "Focus search"],
];
const infoDialog = el("dialog.tasklens-info", {
  onclick: (event) => { if (event.target === infoDialog) infoDialog.close(); },
},
  el("div.info-head", null,
    el("div", null,
      el("div.info-kicker", null, "TASKLENS GUIDE"),
      el("h2", null, "Navigate the work, not the filesystem"),
    ),
    el("button.info-close", { type: "button", "aria-label": "Close information", onclick: () => infoDialog.close() }, "×"),
  ),
  el("p.info-intro", null, "TaskLens turns repository-owned Markdown tasks into a live workspace. Projects stay isolated; views, filters, notes, relationships, and release candidates are read from their source files."),
  el("div.info-grid", null,
    el("section", null,
      el("h3", null, "How to use it"),
      el("p", null, "Choose a project, then switch between Timeline, Kanban, Groups, Files, Features, and Unreleased. Filters combine: selecting several priorities shows tasks matching any selected priority."),
      el("p", null, "ALL clears the priority selection. Done and Wishlist visibility apply across views; area chips drill into the task paths detected in the backlog."),
    ),
    el("section", null,
      el("h3", null, "Keyboard shortcuts"),
      el("div.shortcut-guide", null, shortcutRows.map(([key, description]) =>
        el("div.shortcut-guide-row", null, el("kbd", null, key), el("span", null, description)),
      )),
    ),
  ),
  el("div.info-foot", null, "Press Escape or click outside this panel to close."),
);
document.body.append(infoDialog);

function showInfoDialog() {
  if (!infoDialog.open) infoDialog.showModal();
}

/* ── boot ────────────────────────────────────────────────── */

store.subscribe((reason) => {
  if (reason === "change") {
    const n = store.fresh.size;
    flash(`${n} task${n === 1 ? "" : "s"} updated`);
  }
  render();
});

window.addEventListener("hashchange", applyHash);

route = readHash();

store.load()
  .then(() => {
    restoreState(store.list());
    // An explicit hash is someone's link and always wins over stored state.
    if (!location.hash.replace(/^#\/?/, "") && lastView) {
    route = { kind: "view", backlog: store.activeBacklog, id: lastView, param: null };
    }
    store.connect();
    render();
  })
  .catch((error) => {
    clear(root).append(el("div.empty", null,
      el("div.big", null, "Could not reach the tasklens server"),
      el("div.small", null, String(error.message || error)),
    ));
  });

setInterval(() => updateTrayBadge(store.listAll()), 60_000);
