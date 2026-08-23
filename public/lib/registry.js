/**
 * View registry.
 *
 * A view owns the body of the page. The chrome — brand, path, view switcher,
 * search, shared filter chips — is generic and driven entirely by what the
 * registered views declare, so adding a view never means editing the chrome.
 *
 * To add one: write `public/views/<id>.js` exporting a view object, then add a
 * single import line to `public/views/index.js`. Nothing else changes.
 *
 * @typedef {Object} ViewContext
 * @property {Task[]}            tasks      tasks passing the active filters
 * @property {Task[]}            allTasks   every task, unfiltered
 * @property {Note[]}            notes      every note, newest first, filtered
 * @property {Map<string,Task>}  byNumber
 * @property {Object}            filters    { priority, agent, q }
 * @property {(key, value) => void} setFilter
 * @property {(number) => void}  openTask   route to the detail page
 * @property {Object}            meta       server meta: root, counts, warnings
 * @property {ClientStore}       store
 *
 * @typedef {Object} View
 * @property {string}   id        URL segment, e.g. "kanban"
 * @property {string}   label     switcher label
 * @property {string[]} [filters] shared controls to show: "search" | "priority" | "agent"
 * @property {(ctx: ViewContext) => HTMLElement} mount    build the view root
 * @property {(root: HTMLElement, ctx: ViewContext) => void} [update]  re-render in place
 * @property {(ctx: ViewContext) => HTMLElement|null} [toolbar]  right-hand controls the view owns
 * @property {(root: HTMLElement) => void} [destroy]
 */

const views = [];

export function register(view) {
  if (!view || !view.id || typeof view.mount !== "function") {
    throw new Error("a view needs at least { id, label, mount }");
  }
  if (views.some((v) => v.id === view.id)) {
    throw new Error(`duplicate view id: ${view.id}`);
  }
  views.push({ filters: ["search"], label: view.id, ...view });
  return view;
}

export function allViews() {
  return views.slice();
}

export function getView(id) {
  return views.find((v) => v.id === id) || views[0] || null;
}

export function defaultViewId() {
  return views[0]?.id ?? null;
}
