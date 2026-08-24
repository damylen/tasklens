# 0007 Add macOS menubar icon

Status: done
Priority: medium
Owner: user
Agent: codex
Area: desktop
Parent: none
Depends on: none
References: none

## Context
The macOS desktop app has a bundle icon for the Dock, but it does not create a
status-item icon in the macOS menubar.

## Acceptance Criteria
- A built macOS app shows a TaskLens icon in the menubar.
- Clicking the icon shows and focuses the main TaskLens window.
- The icon is bundled without requiring a source-tree path at runtime.
- The desktop build completes far enough to produce a runnable `.app`.

## Implementation Notes
- Use Tauri's native tray-icon support and embed the existing PNG icon in the
  desktop binary.

## Subtasks
- none

## Agent Notes
- 2026-08-24: Confirmed the app's `Info.plist` references `icon.icns`, but
  `desktop/src-tauri/src/main.rs` has no tray setup. Next: add the native
  menubar item, rebuild, and relaunch the app.
- 2026-08-24: Added a native Tauri menubar icon using the embedded existing PNG,
  with click-to-show/focus behavior for the main window. Rebuilt successfully
  for Apple Silicon, including `TaskLens_0.1.0_aarch64.dmg`, and relaunched the
  new app. Files touched: `desktop/src-tauri/Cargo.toml`,
  `desktop/src-tauri/src/main.rs`, and this task.
- 2026-08-24: Follow-up diagnosis showed the app exited during updater plugin
  initialization because the local config had a null updater section. Added an
  empty local updater config and disabled template rendering so the colored
  menubar icon remains visible. Rebuild and relaunch required.
- 2026-08-24: Added the required `serde_json` dependency for Tauri's configured
  updater plugin. Full desktop build now succeeds and the relaunched
  `tasklens-desktop` process remains active.
- 2026-08-24: User reported a blank window. Diagnosis found the bundled
  frontend under `_up_/_up_/public` while the sidecar was configured to serve
  `Resources/public`. Changed the Tauri resource map to bundle the frontend at
  `Resources/public`; rebuild and relaunch required.
- 2026-08-24: Further diagnosis found the sidecar was compiled from
  `src/cli.ts`, which exports `main()` but does not invoke it. Changed
  `prepare-sidecar.ts` to compile the real `bin/tasklens.js` entrypoint so the
  embedded server actually starts.
- 2026-08-24: The sidecar process remained alive but did not expose its port
  when launched by Tauri because its shell event receiver was dropped. Added a
  stdout/stderr event-drain task so the child process remains observable and
  its pipe cannot block.
- 2026-08-24: Confirmed the server eventually starts after a roughly 3-second
  backlog scan, but the window was created after only 350 ms and kept the
  initial connection-refused blank page. Added a readiness poll before
  creating the webview window.
- 2026-08-24: Final Apple Silicon build succeeds. Verified the bundled app's
  sidecar serves `index.html` on `127.0.0.1:7532` after startup, and the app is
  left running with the menubar icon and populated webview.
