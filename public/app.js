import { el, clear, svg, ICON } from "./lib/dom.js";
import { num } from "./lib/format.js";
import { ClientStore } from "./lib/store.js";
import { createStore } from "./lib/persist.js";
import { allViews, defaultViewId, getView } from "./lib/registry.js";
import { renderDetail, detailCrumb, resetDetailState } from "./views/detail.js";
import { renderOverview } from "./views/overview.js";
import "./views/index.js";

const store = new ClientStore();
const root = document.getElementById("app");

const filters = { q: "", priority: "all", area: "", since: 0, hideDone: false };

/** One namespaced store shared by the chrome and every view. */
let persist = null;
let detailOpen = true;
let lastView = null;

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
  filters.area = "";
  filters.since = 0;

  const saved = store_.read("chrome.filters", null);
  if (saved && typeof saved === "object") {
    filters.hideDone = saved.hideDone === true;
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
    if (filters.priority !== "all" && task.priority !== filters.priority) return false;
    if (!areaMatches(task, filters.area)) return false;
    if (!sinceMatches(task, filters.since)) return false;
    if (filters.hideDone && task.status === "done") return false;
    if (query) {
      const hay = `${task.number} ${task.title} ${task.area} ${task.agent} ${task.id}`.toLowerCase();
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

/**
 * A task is actively worked on when its explicit status says so and its source
 * file changed during the current hour. This deliberately reads the whole store
 * rather than the filtered view: the toolbar is an operational signal, not a
 * summary of whichever slice happens to be open.
 */
function activeWorkCount(tasks, now = Date.now()) {
  return tasks.filter((task) => task.status === "in_progress" && task.mtime >= now - HOUR).length;
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

function chips(label, options, current, onPick) {
  return [
    el("span.rail-label", null, label),
    el("div.chips", null,
      options.map(([value, text]) =>
        el("button.chip.tiny" + (current === value ? ".on" : ""), {
          onclick: () => onPick(value),
        }, text),
      ),
    ),
  ];
}

function topBar(ctx, view) {
  const meta = store.meta;
  const isTask = route.kind === "task";
  const task = isTask ? store.get(route.key) : null;

  const bar = el("div.bar", null,
    el("div.brand", { title: "workspace overview", onclick: () => navigate("#/overview") },
      svg([
        "M12 5a7 7 0 100 14 7 7 0 000-14z",
        "M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3",
      ], { size: 20, stroke: "var(--accent)", width: 1.6 }),
      el("span.brand-name", null, "tasklens"),
    ),
  );

  bar.append(el("div.backlog-tabs", null,
    el("button.backlog-tab" + (route.kind === "overview" ? ".on" : ""), { onclick: () => navigate("#/overview") }, "OVERVIEW"),
    store.listBacklogs().map((backlog) =>
      el("button.backlog-tab" + (backlog.id === store.activeBacklog && route.kind !== "overview" ? ".on" : ""), {
        title: backlog.dir,
        onclick: () => {
          selectBacklog(backlog.id);
          navigate(backlogHash(backlog.id, lastView || defaultViewId()));
        },
      }, backlog.label),
    ),
  ));

  if (isTask && task) {
    bar.append(detailCrumb(task, ctx));
  } else if (route.kind !== "overview") {
    bar.append(
      el("div.rootpath", { title: meta?.root || "" },
        el("span", null, meta?.root || "…"),
        el("span", { class: "live " + (store.connected ? "on" : "off") }),
        el("span", { class: "live-label" + (store.connected ? "" : " off") },
          store.connected ? "WATCHING" : "OFFLINE"),
      ),
      el("div.seg", null,
        allViews().map((v) =>
          el("button.seg-item" + (v.id === view?.id ? ".on" : ""), {
            onclick: () => navigate(backlogHash(store.activeBacklog, v.id)),
          }, v.label),
        ),
      ),
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
      el("div.active-work", {
        title: `${activeWork} in-progress task${activeWork === 1 ? "" : "s"} touched in the last hour`,
        "aria-label": `${activeWork} in-progress tasks touched in the last hour`,
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
    rail.append(...chips("PRIORITY", [
      ["all", "ALL"], ["critical", "CRITICAL"], ["high", "HIGH"], ["medium", "MEDIUM"], ["low", "LOW"],
    ], filters.priority, (v) => ctx.setFilter("priority", v)));
  }

  if (wanted.includes("status")) {
    if (wanted.includes("priority")) rail.append(el("div.rail-div"));
    rail.append(
      el("button.chip.tiny" + (filters.hideDone ? ".on" : ""), {
        title: filters.hideDone ? "show done tasks again" : "take done tasks out of every view",
        onclick: () => ctx.setFilter("hideDone", !filters.hideDone),
      }, filters.hideDone ? "DONE HIDDEN" : "HIDE DONE"),
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
  if (route.kind === "overview") {
    clear(root);
    root.append(topBar({ allTasks: [], meta: null }, null));
    root.append(renderOverview(store.listBacklogs(), (backlog, view) => {
      selectBacklog(backlog);
      navigate(backlogHash(backlog, view));
    }, (label, dir) => store.addBacklog(label, dir)));
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
