import { el } from "../lib/dom.js";

const removing = new Set();
let removeError = "";

function changeKey(change) {
  return `${change.source}\u0000${change.id}`;
}

export async function confirmRemoveChange(change, ctx) {
  if (!globalThis.confirm(
    `Remove '${change.id}' from ${change.source}?\n\nThis deletes the candidate from disk so it will not be included in a release.`,
  )) return;
  const key = changeKey(change);
  removing.add(key);
  removeError = "";
  ctx.rerender();
  try {
    await ctx.store.removeChange(change);
  } catch (error) {
    removeError = error.message || "Could not remove this candidate";
  } finally {
    removing.delete(key);
    ctx.rerender();
  }
}

function linkedTasks(change, ctx) {
  return change.tasks.flatMap((number) => ctx.resolve(number));
}

function changeCard(change, ctx) {
  const tasks = linkedTasks(change, ctx);
  const pending = removing.has(changeKey(change));
  return el("article.change-card", null,
    el("div.change-head", null,
      el("span.change-type", null, change.type.toUpperCase()),
      el("span.change-id", null, change.id),
      el("div.grow"),
      change.date ? el("span.change-date", null, change.date) : null,
      el("button.change-remove", {
        type: "button",
        disabled: pending,
        title: `Remove ${change.id} from ${change.source}`,
        onclick: () => confirmRemoveChange(change, ctx),
      }, pending ? "REMOVING…" : "REMOVE"),
    ),
    el("div.change-summary", null, change.summary),
    change.details ? el("div.change-details", null, change.details) : null,
    change.features?.length ? el("div.feature-tags", null,
      change.features.map((feature) => el("button.feature-tag", {
        onclick: () => ctx.goFeature(feature),
      }, feature)),
    ) : null,
    el("div.change-foot", null,
      el("span.change-source", { title: change.source }, change.source),
      el("div.grow"),
      tasks.length
        ? tasks.map((task) => el("button.change-task-link", {
            onclick: () => ctx.openTask(task.id),
            title: task.title,
          }, task.number))
        : change.tasks.length
          ? el("span.change-missing", null, `TASK ${change.tasks.join(", ")} NOT IN THIS BACKLOG`)
          : el("span.change-missing", null, "NO TASK LINK"),
    ),
  );
}

function build(ctx) {
  const query = ctx.filters.q.trim().toLowerCase();
  const changes = (ctx.backlog?.changes || []).filter((change) => {
    if (!query) return true;
    const haystack = `${change.id} ${change.type} ${change.summary} ${change.details} ${change.source} ${(change.features || []).join(" ")} ${(change.tasks || []).join(" ")}`.toLowerCase();
    return haystack.includes(query);
  });
  const warnings = ctx.backlog?.changeWarnings || [];

  if (!changes.length && !warnings.length) {
    return el("div.empty", null,
      el("div.big", null, query ? "NO MATCHING UNRELEASED CHANGES" : "NO UNRELEASED CHANGES FOUND"),
      el("div.small", null, query
        ? "CLEAR OR CHANGE THE SEARCH"
        : "TASKS KEEP WORKING NORMALLY · RELEASE-NOTES/UNRELEASED.YAML IS OPTIONAL"),
    );
  }

  return el("div.change-view", null,
    el("div.change-intro", null,
      el("div", null,
        el("div.feature-kicker", null, "CHANGE CANDIDATES"),
        el("div.change-title", null, `${changes.length} unreleased`),
      ),
      el("span", null, "Stored in project release-note sources; removing a candidate also removes it from disk."),
    ),
    removeError || warnings.length ? el("div.change-warnings", null,
      removeError ? el("div", null, removeError) : null,
      warnings.map((warning) => el("div", null, warning)),
    ) : null,
    el("div.change-list", null, changes.map((change) => changeCard(change, ctx))),
  );
}

export default {
  id: "changes",
  label: "Unreleased",
  filters: ["search"],
  mount: build,
  update(root, ctx) { root.replaceWith(build(ctx)); },
};
