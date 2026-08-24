import { describe, expect, test } from "bun:test";

describe("desktop localhost IPC capability", () => {
  test("exposes app commands only to TaskLens's main localhost webview", async () => {
    const capability = await Bun.file(new URL(
      "../desktop/src-tauri/capabilities/local-tasklens.json",
      import.meta.url,
    )).json();

    expect(capability.windows).toEqual(["main"]);
    expect(capability.remote).toEqual({ urls: ["http://127.0.0.1:7532/*"] });
    expect(capability.permissions).toEqual(["allow-update-tray-active-count"]);
  });
});
