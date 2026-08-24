use std::{
    net::{SocketAddr, TcpStream},
    thread,
    time::Duration,
};

use tauri::{
    image::Image,
    tray::{TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_shell::{process::CommandEvent, ShellExt};
use tauri_plugin_updater::UpdaterExt;

fn wait_for_server() {
    let address: SocketAddr = ([127, 0, 0, 1], 7532).into();
    for _ in 0..100 {
        if TcpStream::connect_timeout(&address, Duration::from_millis(100)).is_ok() {
            return;
        }
        thread::sleep(Duration::from_millis(100));
    }
}

#[tauri::command]
fn update_tray_active_count(app: AppHandle, count: u32) -> Result<(), String> {
    let tray = app
        .tray_by_id("main")
        .ok_or_else(|| "TaskLens tray icon is unavailable".to_string())?;
    tray.set_title(Some(format!(" {count}")))
        .map_err(|error| error.to_string())?;

    #[cfg(target_os = "macos")]
    app.get_webview_window("main")
        .ok_or_else(|| "TaskLens window is unavailable".to_string())?
        .set_badge_count(dock_badge_count(count))
        .map_err(|error| error.to_string())?;

    Ok(())
}

fn dock_badge_count(count: u32) -> Option<i64> {
    (count > 0).then_some(i64::from(count))
}

#[cfg(test)]
mod tests {
    use super::dock_badge_count;

    #[test]
    fn active_work_uses_a_numeric_dock_badge_and_zero_clears_it() {
        assert_eq!(dock_badge_count(3), Some(3));
        assert_eq!(dock_badge_count(0), None);
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let tray_icon = Image::from_bytes(include_bytes!("../icons/icon.png"))?;
            TrayIconBuilder::with_id("main")
                .icon(tray_icon)
                .icon_as_template(false)
                .tooltip("TaskLens")
                .on_tray_icon_event(|tray, event| {
                    if matches!(event, TrayIconEvent::Click { .. }) {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            let resources = app.path().resource_dir()?;
            let public_dir = resources.join("public");
            let (mut sidecar_events, _sidecar_child) = app
                .shell()
                .sidecar("tasklens-server")?
                .args([
                    "serve",
                    "--empty",
                    "--no-open",
                    "--host",
                    "127.0.0.1",
                    "--port",
                    "7532",
                ])
                .env(
                    "TASKLENS_PUBLIC_DIR",
                    public_dir.to_string_lossy().to_string(),
                )
                .spawn()?;
            tauri::async_runtime::spawn(async move {
                while let Some(event) = sidecar_events.recv().await {
                    match event {
                        CommandEvent::Stdout(bytes) => {
                            eprint!("[tasklens-server] {}", String::from_utf8_lossy(&bytes));
                        }
                        CommandEvent::Stderr(bytes) => {
                            eprint!("[tasklens-server] {}", String::from_utf8_lossy(&bytes));
                        }
                        CommandEvent::Error(error) => eprintln!("[tasklens-server] {error}"),
                        CommandEvent::Terminated(payload) => {
                            eprintln!("[tasklens-server] terminated: {:?}", payload);
                            break;
                        }
                        _ => {}
                    }
                }
            });

            // The server scans configured backlogs before it binds its port.
            // Wait for readiness so the webview does not load a one-time
            // connection-refused page while that scan is still running.
            wait_for_server();
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
                let Ok(updater) = handle.updater() else {
                    return;
                };
                let Ok(Some(update)) = updater.check().await else {
                    return;
                };
                if update.download_and_install(|_, _| {}, || {}).await.is_ok() {
                    handle.restart();
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![update_tray_active_count])
        .run(tauri::generate_context!())
        .expect("error while running TaskLens desktop");
}
