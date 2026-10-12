const APP_COMMANDS: &[&str] = &["get_service_token"];

fn main() {
    let attributes = tauri_build::Attributes::new()
        .app_manifest(tauri_build::AppManifest::new().commands(APP_COMMANDS));
    tauri_build::try_build(attributes).expect("failed to run the Tauri build script");
}
