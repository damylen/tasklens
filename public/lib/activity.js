const HOUR = 3600e3;

export function isActiveWorkTask(task, now = Date.now()) {
  return task.status === "in_progress" && task.mtime >= now - HOUR;
}

/** The shared ACTIVE · 1H definition used by the web UI and native badge. */
export function activeWorkCount(tasks, now = Date.now()) {
  return tasks.filter((task) => isActiveWorkTask(task, now)).length;
}
