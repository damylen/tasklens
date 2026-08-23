import { cp, mkdir, readdir } from "node:fs/promises";
import { basename, resolve } from "node:path";

const root = resolve(import.meta.dir, "..", "..");
const source = resolve(root, "desktop", "src-tauri", "target", "release", "bundle");
const output = resolve(root, "desktop", "release-assets");
const artifact = /\.(dmg|exe|msi|zip|tar\.gz|sig)$/i;

await mkdir(output, { recursive: true });
for await (const file of walk(source)) {
  if (!artifact.test(file)) continue;
  await cp(file, resolve(output, basename(file)));
}

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile()) yield path;
  }
}
