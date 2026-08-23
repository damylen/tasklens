import { el, clear, svg, ICON } from "./lib/dom.js";
import { num } from "./lib/format.js";
import { ClientStore } from "./lib/store.js";
import { allViews, defaultViewId, getView } from "./lib/registry.js";
import { renderDetail, detailCrumb, resetDetailState } from "./views/detail.js";
import "./views/index.js";

const store = new ClientStore();
const root = document.getElementById("app");

const filters = { q: "", priority: "all", area: "" };
let route = { kind: "view", id: defaultViewId() };
let active = null;      // { view, node }
let searchInput = null;

/* ── routing ─────────────────────────────────────────────── */

function readHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [head, tail] = raw.split("/");
  if (head === "task" && tail) return { kind: "task", key: decodeURIComponent(tail) };
  if (head && getView(head)?.id === head) return { kind: "view", id: head };
  return { kind: "view", id: defaultViewId() };
}

function applyHash() {
  const next = readHash();
  const changedKind = next.kind !== route.kind;
  const changedView = next.kind === "view" && next.id !== route.id;
  if (next.kind === "task") resetDetailState();
  route = next;
  if (changedKind || changedView) teardown();
  render();
}

function navigate(hash) {
  if (location.hash === hash) applyHash();
  else location.hash = hash;
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
    store,
    setFilter(key, value) {
      filters[key] = value;
      render();
    },
    openTask(id) {
      navigate(`#/task/${encodeURIComponent(id)}`);
    },
    goBack() {
      navigate(`#/${route.previousView || defaultViewId()}`);
    },
    rerender() {
      render();
    },
  };
}

/* ── chrome ──────────────────────────────────────────────── */

const OTHER = "__other__";

const AREA_CHIP_LIMIT = 8;

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
        el("button.chip" + (current === value ? ".on" : ""), {
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
    el("div.brand", { onclick: () => navigate(`#/${defaultViewId()}`) },
      svg([
        "M12 5a7 7 0 100 14 7 7 0 000-14z",
        "M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3",
      ], { size: 20, stroke: "var(--accent)", width: 1.6 }),
      el("span.brand-name", null, "tasklens"),
    ),
  );

  if (isTask && task) {
    bar.append(detailCrumb(task, ctx));
  } else {
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
            onclick: () => navigate(`#/${v.id}`),
          }, v.label),
        ),
      ),
    );
  }

  bar.append(el("div.grow"));

  if (!isTask && view?.filters?.includes("search")) {
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

  if (meta) {
    bar.append(
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
    row.append(el("button.chip.on", {
      title: `clear ${upto}`,
      onclick: () => ctx.setFilter("area", segments.slice(0, index).join("/")),
    }, `${label} ×`));
  });

  if (!selected.endsWith(OTHER)) {
    const { head, tailCount } = areaChildren(ctx.allTasks, selected);
    if (!segments.length) {
      row.append(el("button.chip" + (selected ? "" : ".on"), {
        onclick: () => ctx.setFilter("area", ""),
      }, "ALL"));
    }
    for (const [key, count] of head) {
      const leaf = key.split("/").pop();
      row.append(el("button.chip", {
        title: `${key} · ${count} tasks`,
        onclick: () => ctx.setFilter("area", key),
      }, `${leaf} ${count}`));
    }
    if (tailCount) {
      row.append(el("button.chip", {
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
  const hasChips = wanted.includes("priority") || wanted.includes("area");
  if (!hasChips && !toolbar) return null;

  const rail = el("div.rail");

  if (wanted.includes("priority")) {
    rail.append(...chips("PRIORITY", [
      ["all", "ALL"], ["critical", "CRITICAL"], ["high", "HIGH"], ["medium", "MEDIUM"], ["low", "LOW"],
    ], filters.priority, (v) => ctx.setFilter("priority", v)));
  }

  if (wanted.includes("area")) {
    if (wanted.includes("priority")) rail.append(el("div.rail-div"));
    rail.append(...areaControl(ctx));
  }

  rail.append(el("div.grow"));
  if (toolbar) rail.append(toolbar);
  return rail;
}

/* ── render ──────────────────────────────────────────────── */

function render(options = {}) {
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

  const bar = topBar(ctx, view);
  const rail = filterRail(ctx, view);

  if (active?.view?.id === view.id && active.node.isConnected && view.update) {
    // Keep the view's DOM (and its scroll position) and swap only the chrome.
    root.replaceChild(bar, root.firstChild);
    const existingRail = root.children[1];
    if (rail && existingRail?.classList.contains("rail")) root.replaceChild(rail, existingRail);
    view.update(active.node, ctx);
  } else {
    teardown();
    const node = view.mount(ctx);
    active = { view, node };
    clear(root);
    root.append(bar);
    if (rail) root.append(rail);
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
    store.connect();
    render();
  })
  .catch((error) => {
    clear(root).append(el("div.empty", null,
      el("div.big", null, "Could not reach the tasklens server"),
      el("div.small", null, String(error.message || error)),
    ));
  });
