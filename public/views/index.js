/**
 * Every view the app knows about. Adding one is a single line here plus the
 * file it points at — the chrome, routing and filter plumbing pick it up
 * automatically. Order is switcher order; the first entry is the default view.
 */
import { register } from "../lib/registry.js";
import kanban from "./kanban.js";
import timeline from "./timeline.js";
import groups from "./groups.js";
import files from "./files.js";

register(kanban);
register(timeline);
register(groups);
register(files);
