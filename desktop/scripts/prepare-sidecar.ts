import { $ } from "bun";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { basename, resolve } from "node:path";

const root = resolve(import.meta.dir, "..", "..");
const triple = process.env.TAURI_ENV_TARGET_TRIPLE || hostTriple();
const suffix = process.platform === "win32" ? ".exe" : "";
const output = resolve(root, "desktop", "src-tauri", "binaries", `tasklens-server-${triple}${suffix}`);

await mkdir(resolve(root, "desktop", "src-tauri", "binaries"), { recursive: true });
await $`bun build --compile ${resolve(root, "bin", "tasklens.js")} --outfile ${output}`;

if (!existsSync(output)) throw new Error(`TaskLens sidecar was not created: ${basename(output)}`);
console.log(`Prepared native TaskLens sidecar: ${basename(output)}`);

function hostTriple(): string {
  if (process.platform === "darwin") return process.arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
  if (process.platform === "win32") return "x86_64-pc-windows-msvc";
  if (process.platform === "linux") return process.arch === "arm64" ? "aarch64-unknown-linux-gnu" : "x86_64-unknown-linux-gnu";
  throw new Error(`Unsupported host platform: ${process.platform}/${process.arch}`);
}
