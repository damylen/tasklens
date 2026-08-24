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
import features from "./features.js";
import changes from "./changes.js";

register(timeline);
register(kanban);
register(groups);
register(files);
register(features);
register(changes);
