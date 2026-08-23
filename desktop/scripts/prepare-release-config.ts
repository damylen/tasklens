import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..", "..");
const endpoint = process.env.TASKLENS_UPDATE_ENDPOINT;
const pubkey = process.env.TAURI_UPDATER_PUBKEY;

if (!endpoint || !pubkey) {
  throw new Error("TASKLENS_UPDATE_ENDPOINT and TAURI_UPDATER_PUBKEY are required for a release build");
}

const basePath = resolve(root, "desktop", "src-tauri", "tauri.conf.json");
const config = JSON.parse(await readFile(basePath, "utf8"));
config.plugins = {
  ...config.plugins,
  updater: { endpoints: [endpoint], pubkey },
};
config.bundle = { ...config.bundle, createUpdaterArtifacts: true };
await writeFile(resolve(root, "desktop", "tauri.release.conf.json"), `${JSON.stringify(config, null, 2)}\n`);
