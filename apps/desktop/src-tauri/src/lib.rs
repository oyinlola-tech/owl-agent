#[allow(non_snake_case)]
mod deepLink_navigation;
#[allow(non_snake_case)]
mod serviceSidecar_process;
#[allow(non_snake_case)]
mod serviceToken_process;

use deepLink_navigation::{focus_main_window, open_deep_links};
use serviceSidecar_process::{
    start_service_sidecar_unless_port_is_taken, stop_service_sidecar, RunningServiceProcess,
};
use serviceToken_process::{get_service_token, ServiceTokenState};
use tauri::{App, RunEvent};
use tauri_plugin_deep_link::DeepLinkExt;

fn listen_for_deep_links(app: &App) {
    #[cfg(any(windows, target_os = "linux"))]
    {
        if let Err(error) = app.deep_link().register_all() {
            eprintln!("owl: could not register the owl:// link handler ({error})");
        }
    }

    let handle = app.handle().clone();
    app.deep_link().on_open_url(move |event| {
        open_deep_links(&handle, &event.urls());
    });

    if let Ok(Some(urls)) = app.deep_link().get_current() {
        open_deep_links(app.handle(), &urls);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            focus_main_window(app);
        }));
    }

    let app = builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(RunningServiceProcess::empty())
        .manage(ServiceTokenState::empty())
        .invoke_handler(tauri::generate_handler![get_service_token])
        .setup(|app| {
            listen_for_deep_links(app);
            if let Err(error) = start_service_sidecar_unless_port_is_taken(app.handle()) {
                eprintln!("owl-service: could not start ({error}); the app will show its offline state until the service is reachable");
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the OWL desktop app");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            stop_service_sidecar(handle);
        }
    });
}
