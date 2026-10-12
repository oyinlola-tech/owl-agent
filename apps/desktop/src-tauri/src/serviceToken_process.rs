use std::fmt::Write;
use std::sync::Mutex;

use tauri::{AppHandle, Manager, State, WebviewWindow};

const TOKEN_BYTE_COUNT: usize = 32;
const TOKEN_FILE_NAME: &str = "service.token";
const MAIN_WINDOW_LABEL: &str = "main";

pub enum ServiceTokenSource {
    NotReady,
    LaunchedWithToken(String),
    ReusingRunningService,
    NoOwlService,
}

pub struct ServiceTokenState(pub Mutex<ServiceTokenSource>);

impl ServiceTokenState {
    pub fn empty() -> Self {
        ServiceTokenState(Mutex::new(ServiceTokenSource::NotReady))
    }

    pub fn remember(&self, source: ServiceTokenSource) {
        if let Ok(mut slot) = self.0.lock() {
            *slot = source;
        }
    }
}

pub fn generate_random_service_token() -> Result<String, String> {
    // Security: the token is the only thing stopping websites and other local programs from
    // driving the agent service, so it comes from the OS CSPRNG and is never logged.
    let mut bytes = [0u8; TOKEN_BYTE_COUNT];
    getrandom::fill(&mut bytes).map_err(|error| format!("no secure random source ({error})"))?;
    let mut token = String::with_capacity(TOKEN_BYTE_COUNT * 2);
    for byte in bytes {
        let _ = write!(token, "{byte:02x}");
    }
    Ok(token)
}

fn read_token_file_of_running_service(app: &AppHandle) -> Option<String> {
    let path = app.path().app_data_dir().ok()?.join(TOKEN_FILE_NAME);
    let text = std::fs::read_to_string(path).ok()?;
    let token = text.trim();
    (!token.is_empty()).then(|| token.to_string())
}

#[tauri::command]
pub fn get_service_token(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, ServiceTokenState>,
) -> Result<String, String> {
    // Security: only the main app window may read the token; the capability file scopes the
    // command to it as well, this check keeps that true if more windows are added later.
    if window.label() != MAIN_WINDOW_LABEL {
        return Err("this window may not read the service token".to_string());
    }
    let slot = state.0.lock().map_err(|_| "service token state is unavailable".to_string())?;
    match &*slot {
        ServiceTokenSource::LaunchedWithToken(token) => Ok(token.clone()),
        ServiceTokenSource::ReusingRunningService => read_token_file_of_running_service(&app)
            .ok_or_else(|| "the running OWL service has no readable service.token".to_string()),
        ServiceTokenSource::NoOwlService | ServiceTokenSource::NotReady => {
            Err("the OWL service was not started by this app".to_string())
        }
    }
}
