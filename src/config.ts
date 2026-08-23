import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export interface BacklogConfig {
  id: string;
  label: string;
  dir: string;
}

interface ConfigFile {
  backlogs: BacklogConfig[];
}

export function defaultConfigPath(env = process.env): string {
  if (env.TASKLENS_CONFIG) return resolve(env.TASKLENS_CONFIG);
  return join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "tasklens", "backlogs.json");
}

function normalizeId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function loadBacklogs(path = defaultConfigPath()): Promise<BacklogConfig[]> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as Partial<ConfigFile>;
    if (!Array.isArray(parsed.backlogs)) return [];
    const seen = new Set<string>();
    return parsed.backlogs.flatMap((item) => {
      const id = normalizeId(String(item?.id || ""));
      const label = String(item?.label || "").trim();
      const dir = String(item?.dir || "").trim();
      if (!id || !label || !dir || seen.has(id)) return [];
      seen.add(id);
      return [{ id, label, dir: resolve(dir) }];
    });
  } catch {
    return [];
  }
}

export async function saveBacklogs(backlogs: BacklogConfig[], path = defaultConfigPath()): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const text = JSON.stringify({ backlogs }, null, 2) + "\n";
  const temp = `${path}.tmp`;
  await writeFile(temp, text, "utf8");
  await rename(temp, path);
}

export async function addBacklog(label: string, dir: string, path = defaultConfigPath()): Promise<BacklogConfig> {
  const id = normalizeId(label);
  if (!id) throw new Error("backlog name must contain a letter or number");
  const backlogs = await loadBacklogs(path);
  if (backlogs.some((backlog) => backlog.id === id)) throw new Error(`backlog '${id}' already exists`);
  const backlog = { id, label: label.trim(), dir: resolve(dir) };
  await saveBacklogs([...backlogs, backlog], path);
  return backlog;
}

export async function removeBacklog(name: string, path = defaultConfigPath()): Promise<boolean> {
  const id = normalizeId(name);
  const backlogs = await loadBacklogs(path);
  const remaining = backlogs.filter((backlog) => backlog.id !== id);
  if (remaining.length === backlogs.length) return false;
  await saveBacklogs(remaining, path);
  return true;
}
