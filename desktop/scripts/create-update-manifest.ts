import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..", "..");
const assets = resolve(root, "desktop", "release-assets");
const version = process.env.TASKLENS_RELEASE_VERSION;
const baseUrl = process.env.TASKLENS_RELEASE_ASSET_BASE_URL;
if (!version || !baseUrl) throw new Error("TASKLENS_RELEASE_VERSION and TASKLENS_RELEASE_ASSET_BASE_URL are required");

const signatures = await readdir(assets);
const mac = await platform("darwin-aarch64", signatures, /\.app\.tar\.gz\.sig$/);
const windows = await platform("windows-x86_64", signatures, /\.exe\.zip\.sig$/);

await writeFile(resolve(assets, "latest.json"), `${JSON.stringify({
  version,
  notes: `TaskLens ${version}`,
  pub_date: new Date().toISOString(),
  platforms: { [mac.platform]: mac.entry, [windows.platform]: windows.entry },
}, null, 2)}\n`);

async function platform(platform: string, files: string[], expected: RegExp) {
  const signatureFile = files.find((file) => expected.test(file));
  if (!signatureFile) throw new Error(`No signed ${platform} updater archive found in ${assets}`);
  const archive = signatureFile.slice(0, -4);
  return {
    platform,
    entry: {
      signature: (await readFile(resolve(assets, signatureFile), "utf8")).trim(),
      url: `${baseUrl}/${encodeURIComponent(archive)}`,
    },
  };
}
