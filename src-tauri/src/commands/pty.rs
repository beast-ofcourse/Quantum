use portable_pty::{
    native_pty_system, Child, ChildKiller, CommandBuilder, MasterPty, PtySize,
};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Emitter, State};

/// Event name for swarm-specific agent exit (global, not per-session).
const SWARM_AGENT_EXIT_EVENT: &str = "swarm:agent-exit";

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PtyExitPayload {
    pub code: Option<i32>,
    pub signal: Option<i32>,
}

pub struct PtyHandle {
    pub writer: Mutex<Box<dyn Write + Send>>,
    pub killer: Mutex<Option<Box<dyn ChildKiller + Send + Sync>>>,
    pub master: Mutex<Box<dyn MasterPty + Send>>,
}

#[derive(Clone)]
pub struct PtySessionState {
    pub sessions: Arc<Mutex<HashMap<String, PtyHandle>>>,
}

impl PtySessionState {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

fn stdout_event(session_id: &str) -> String {
    format!("terminal:stdout:{}", session_id)
}

fn exit_event(session_id: &str) -> String {
    format!("terminal:exit:{}", session_id)
}

fn reader_thread(
    app: AppHandle,
    session_id: String,
    state: PtySessionState,
    mut reader: Box<dyn Read + Send>,
    mut child: Box<dyn Child + Send + Sync>,
) {
    let mut buf = [0u8; 4096];
    loop {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                let data = String::from_utf8_lossy(&buf[..n]).into_owned();
                let _ = app.emit(&stdout_event(&session_id), data);
            }
            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(_) => break,
        }
    }
    let payload = match child.wait() {
        Ok(status) => PtyExitPayload {
            code: Some(status.exit_code() as i32),
            signal: status.signal().and_then(|s| s.parse::<i32>().ok()),
        },
        Err(_) => PtyExitPayload {
            code: None,
            signal: None,
        },
    };
    let _ = app.emit(&exit_event(&session_id), &payload);
    // Also emit swarm-wide agent exit event
    let _ = app.emit(SWARM_AGENT_EXIT_EVENT, &payload);
    
    // Remove session from the map on exit or error
    if let Ok(mut sessions) = state.sessions.lock() {
        sessions.remove(&session_id);
    }
}

/// Get or init the global sessions store for swarm/internal PTY access.
fn internal_sessions() -> &'static Mutex<HashMap<String, Arc<PtyHandle>>> {
    static SESSIONS: OnceLock<Mutex<HashMap<String, Arc<PtyHandle>>>> = OnceLock::new();
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Internal spawn_pty implementation used by swarm commands.
/// Accepts optional extra environment variables.
pub async fn spawn_pty_internal(
    app: AppHandle,
    session_id: String,
    shell_path: String,
    shell_args: Vec<String>,
    cwd: String,
    cols: u16,
    rows: u16,
    env: Option<HashMap<String, String>>,
) -> Result<i32, String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {}", e))?;

    let mut cmd = CommandBuilder::new(&shell_path);
    for arg in &shell_args {
        cmd.arg(arg);
    }
    if !cwd.is_empty() {
        cmd.cwd(cwd);
    }
    // Inject extra environment variables
    if let Some(env_vars) = env {
        for (key, value) in env_vars {
            cmd.env(key, value);
        }
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell: {}", e))?;

    let pid = child
        .process_id()
        .ok_or_else(|| "Failed to get child process ID after shell spawn".to_string())?
        as i32;

    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone reader: {}", e))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to take writer: {}", e))?;
    let killer = child.clone_killer();

    let handle = PtyHandle {
        writer: Mutex::new(writer),
        killer: Mutex::new(Some(killer)),
        master: Mutex::new(pair.master),
    };

    // Store session in the global sessions map
    {
        let sessions = internal_sessions().lock().unwrap();
        if sessions.contains_key(&session_id) {
            return Err(format!("Session already exists: {}", session_id));
        }
    }
    {
        let mut sessions = internal_sessions().lock().unwrap();
        sessions.insert(session_id.clone(), Arc::new(handle));
    }

    let app_clone = app.clone();
    let session_id_clone = session_id.clone();
    std::thread::spawn(move || {
        reader_thread_internal(app_clone, session_id_clone, reader, child);
    });

    Ok(pid)
}

/// Internal reader thread (swarm PTY).
fn reader_thread_internal(
    app: AppHandle,
    session_id: String,
    mut reader: Box<dyn Read + Send>,
    mut child: Box<dyn Child + Send + Sync>,
) {
    let mut buf = [0u8; 4096];
    loop {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                let data = String::from_utf8_lossy(&buf[..n]).into_owned();
                let _ = app.emit(&stdout_event(&session_id), data);
            }
            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(_) => break,
        }
    }
    let payload = match child.wait() {
        Ok(status) => PtyExitPayload {
            code: Some(status.exit_code() as i32),
            signal: status.signal().and_then(|s| s.parse::<i32>().ok()),
        },
        Err(_) => PtyExitPayload {
            code: None,
            signal: None,
        },
    };
    let _ = app.emit(&exit_event(&session_id), &payload);

    // Also emit swarm:agent-exit event for swarm coordination
    let _ = app.emit(SWARM_AGENT_EXIT_EVENT, &payload);

    // Remove session from the global map on exit
    if let Ok(mut sessions) = internal_sessions().lock() {
        sessions.remove(&session_id);
    }
}

#[tauri::command]
pub async fn spawn_pty(
    app: AppHandle,
    state: State<'_, PtySessionState>,
    session_id: String,
    shell_path: String,
    shell_args: Vec<String>,
    cwd: String,
    cols: u16,
    rows: u16,
    env: Option<HashMap<String, String>>,
) -> Result<i32, String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {}", e))?;

    let mut cmd = CommandBuilder::new(&shell_path);
    for arg in &shell_args {
        cmd.arg(arg);
    }
    if !cwd.is_empty() {
        cmd.cwd(cwd);
    }
    // Inject extra environment variables
    if let Some(env_vars) = env {
        for (key, value) in env_vars {
            cmd.env(key, value);
        }
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell: {}", e))?;

    let pid = child
        .process_id()
        .ok_or_else(|| "Failed to get child process ID after shell spawn".to_string())?
        as i32;

    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone reader: {}", e))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to take writer: {}", e))?;
    let killer = child.clone_killer();

    let handle = PtyHandle {
        writer: Mutex::new(writer),
        killer: Mutex::new(Some(killer)),
        master: Mutex::new(pair.master),
    };

    {
        let mut sessions = state
            .sessions
            .lock()
            .map_err(|e| format!("Mutex lock failed: {}", e))?;
        if sessions.contains_key(&session_id) {
            return Err(format!("Session already exists: {}", session_id));
        }
        sessions.insert(session_id.clone(), handle);
    }

    let app_clone = app.clone();
    let session_id_clone = session_id.clone();
    let state_clone = state.inner().clone();
    std::thread::spawn(move || {
        reader_thread(app_clone, session_id_clone, state_clone, reader, child);
    });

    Ok(pid)
}

#[tauri::command]
pub async fn write_pty(
    state: State<'_, PtySessionState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let sessions = state
        .sessions
        .lock()
        .map_err(|e| format!("Mutex lock failed: {}", e))?;
    let handle = sessions
        .get(&session_id)
        .ok_or_else(|| format!("Unknown session: {}", session_id))?;
    let mut writer = handle
        .writer
        .lock()
        .map_err(|e| format!("Mutex lock failed: {}", e))?;
    writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("Write failed: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn resize_pty(
    state: State<'_, PtySessionState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sessions = state
        .sessions
        .lock()
        .map_err(|e| format!("Mutex lock failed: {}", e))?;
    let handle = sessions
        .get(&session_id)
        .ok_or_else(|| format!("Unknown session: {}", session_id))?;
    let master = handle
        .master
        .lock()
        .map_err(|e| format!("Mutex lock failed: {}", e))?;
    master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Resize failed: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn kill_pty(
    state: State<'_, PtySessionState>,
    session_id: String,
) -> Result<(), String> {
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|e| format!("Mutex lock failed: {}", e))?;
    if let Some(handle) = sessions.get(&session_id) {
        let mut killer_guard = handle
            .killer
            .lock()
            .map_err(|e| format!("Mutex lock failed: {}", e))?;
        if let Some(mut killer) = killer_guard.take() {
            let _ = killer.kill();
        }
    }
    sessions.remove(&session_id);
    Ok(())
}
