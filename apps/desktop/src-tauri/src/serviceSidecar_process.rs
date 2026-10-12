use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

use crate::serviceToken_process::{generate_random_service_token, ServiceTokenSource, ServiceTokenState};

pub const SERVICE_PORT: u16 = 8000;
const SIDECAR_NAME: &str = "owl-service";
const PORT_PROBE_TIMEOUT: Duration = Duration::from_millis(400);
const SERVICE_TOKEN_ENV: &str = "OWL_SERVICE_TOKEN";

pub struct RunningServiceProcess(pub Mutex<Option<CommandChild>>);

impl RunningServiceProcess {
    pub fn empty() -> Self {
        RunningServiceProcess(Mutex::new(None))
    }
}

fn service_address() -> SocketAddr {
    SocketAddr::from(([127, 0, 0, 1], SERVICE_PORT))
}

fn is_service_port_in_use() -> bool {
    TcpStream::connect_timeout(&service_address(), PORT_PROBE_TIMEOUT).is_ok()
}

fn is_owl_service_answering_health_check() -> bool {
    let Ok(mut stream) = TcpStream::connect_timeout(&service_address(), PORT_PROBE_TIMEOUT) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let request = "GET /health HTTP/1.0\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n";
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut response = String::new();
    let _ = stream.read_to_string(&mut response);
    response.starts_with("HTTP/1.") && response.contains("\"status\":\"ok\"")
}

fn print_sidecar_output_until_it_exits(mut events: tauri::async_runtime::Receiver<CommandEvent>) {
    tauri::async_runtime::spawn(async move {
        while let Some(event) = events.recv().await {
            match event {
                CommandEvent::Stdout(line) | CommandEvent::Stderr(line) => {
                    eprintln!("owl-service: {}", String::from_utf8_lossy(&line).trim_end());
                }
                CommandEvent::Terminated(payload) => {
                    eprintln!("owl-service: stopped (exit code {:?})", payload.code);
                    break;
                }
                _ => {}
            }
        }
    });
}

pub fn start_service_sidecar_unless_port_is_taken(app: &AppHandle) -> Result<(), String> {
    let token_state = app.state::<ServiceTokenState>();
    if is_service_port_in_use() {
        if is_owl_service_answering_health_check() {
            token_state.remember(ServiceTokenSource::ReusingRunningService);
            eprintln!("owl-service: an OWL service is already running on port {SERVICE_PORT}; reusing it");
        } else {
            token_state.remember(ServiceTokenSource::NoOwlService);
            eprintln!(
                "owl-service: port {SERVICE_PORT} is used by another program; the app will run in sample-data mode"
            );
        }
        return Ok(());
    }

    let data_dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&data_dir).map_err(|error| error.to_string())?;
    let arguments: Vec<String> = vec![
        "--port".to_string(),
        SERVICE_PORT.to_string(),
        "--data-dir".to_string(),
        data_dir.to_string_lossy().to_string(),
        "--exit-when-stdin-closes".to_string(),
    ];

    let token = generate_random_service_token()?;
    let command = app
        .shell()
        .sidecar(SIDECAR_NAME)
        .map_err(|error| error.to_string())?
        .args(arguments)
        .env(SERVICE_TOKEN_ENV, &token);
    let (events, child) = command.spawn().map_err(|error| error.to_string())?;
    token_state.remember(ServiceTokenSource::LaunchedWithToken(token));
    print_sidecar_output_until_it_exits(events);

    let state = app.state::<RunningServiceProcess>();
    let mut slot = state.0.lock().map_err(|error| error.to_string())?;
    *slot = Some(child);
    Ok(())
}

pub fn stop_service_sidecar(app: &AppHandle) {
    let Some(state) = app.try_state::<RunningServiceProcess>() else {
        return;
    };
    let child = match state.0.lock() {
        Ok(mut slot) => slot.take(),
        Err(_) => None,
    };
    if let Some(child) = child {
        let _ = child.kill();
    }
}
