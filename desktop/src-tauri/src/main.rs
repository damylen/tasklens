use std::{thread, time::Duration};

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_updater::UpdaterExt;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let resources = app.path().resource_dir()?;
            let public_dir = resources.join("public");
            app.shell()
                .sidecar("tasklens-server")?
                .args(["serve", "--empty", "--no-open", "--host", "127.0.0.1", "--port", "7532"])
                .env("TASKLENS_PUBLIC_DIR", public_dir.to_string_lossy().to_string())
                .spawn()?;

            // The server starts after its initial scan; opening after this brief
            // delay avoids showing an opaque connection error in the webview.
            thread::sleep(Duration::from_millis(350));
            WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External("http://127.0.0.1:7532/#/overview".parse()?),
            )
            .title("TaskLens")
            .inner_size(1440.0, 900.0)
            .min_inner_size(960.0, 640.0)
            .build()?;

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let Ok(updater) = handle.updater() else { return };
                let Ok(Some(update)) = updater.check().await else { return };
                if update.download_and_install(|_, _| {}, || {}).await.is_ok() {
                    handle.restart();
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running TaskLens desktop");
}
