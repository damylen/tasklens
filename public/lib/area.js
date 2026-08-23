import { el } from "./dom.js";

/**
 * The area shown on a card or row, rendered as one clickable chip per area the
 * task belongs to. Clicking sets the area filter to that exact path; clicking
 * the one already filtering clears it, so the same label toggles both ways.
 *
 * `task.areaPaths` is the normalized form the filter matches on, while
 * `task.areas` is what the file literally said. The label shows the file's
 * wording and filters on the normalized path, so a task written as `web-app`
 * reads as `web-app` but filters together with `web/app`.
 */
export function areaLabel(task, ctx, { className = "card-area" } = {}) {
  const paths = task.areaPaths;
  if (!paths.length) return el(`span.${className}`, null, "—");

  const written = task.areas.length ? task.areas : [task.area];
  const active = ctx.filters.area;

  const wrap = el(`span.${className}`);
  paths.forEach((path, index) => {
    const isActive = active === path;
    if (index) wrap.append(el("span.area-sep", null, ", "));
    wrap.append(
      el("button.area-link" + (isActive ? ".on" : ""), {
        title: isActive ? `clear the ${path} filter` : `filter to ${path}`,
        onclick: (event) => {
          event.stopPropagation();
          ctx.toggleArea(path);
        },
      }, (written[index] || path).trim()),
    );
  });
  return wrap;
}
