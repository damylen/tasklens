fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&["update_tray_active_count"]),
        ),
    )
    .expect("failed to build TaskLens desktop configuration")
}
