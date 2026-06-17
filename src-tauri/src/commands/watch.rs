use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

pub struct WatcherState {
    pub watchers: Mutex<HashMap<String, RecommendedWatcher>>,
}

impl WatcherState {
    pub fn new() -> Self {
        Self {
            watchers: Mutex::new(HashMap::new()),
        }
    }
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WatchEvent {
    pub root: String,
    pub kind: String,
    pub paths: Vec<String>,
}

fn event_kind_name(kind: &notify::EventKind) -> &'static str {
    use notify::EventKind::*;
    match kind {
        Create(_) => "create",
        Modify(_) => "modify",
        Remove(_) => "remove",
        Access(_) => "access",
        Any => "any",
        Other => "other",
    }
}

#[tauri::command]
pub async fn watch_directory(
    app: AppHandle,
    state: State<'_, WatcherState>,
    path: String,
) -> Result<(), String> {
    let path_buf = PathBuf::from(&path);
    if !path_buf.exists() {
        return Err(format!("Path does not exist: {}", path));
    }
    if !path_buf.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }

    let app_clone = app.clone();
    let path_clone = path.clone();
    let mut watcher: RecommendedWatcher = notify::recommended_watcher(
        move |res: notify::Result<notify::Event>| {
            if let Ok(event) = res {
                let payload = WatchEvent {
                    root: path_clone.clone(),
                    kind: event_kind_name(&event.kind).to_string(),
                    paths: event
                        .paths
                        .iter()
                        .map(|p| p.to_string_lossy().into_owned())
                        .collect(),
                };
                let _ = app_clone.emit("fs:change", payload);
            }
        },
    )
    .map_err(|e| format!("Failed to create watcher: {}", e))?;

    watcher
        .watch(&path_buf, RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to watch path: {}", e))?;

    let mut watchers = state
        .watchers
        .lock()
        .map_err(|e| format!("Mutex lock failed: {}", e))?;
    if watchers.contains_key(&path) {
        // Another call won the race; drop our redundant watcher.
        drop(watchers);
        return Ok(());
    }
    watchers.insert(path, watcher);
    Ok(())
}

#[tauri::command]
pub async fn unwatch_directory(
    state: State<'_, WatcherState>,
    path: String,
) -> Result<(), String> {
    let mut watchers = state
        .watchers
        .lock()
        .map_err(|e| format!("Mutex lock failed: {}", e))?;
    if watchers.remove(&path).is_none() {
        return Err(format!("No watcher for path: {}", path));
    }
    Ok(())
}

#[tauri::command]
pub async fn unwatch_all(state: State<'_, WatcherState>) -> Result<(), String> {
    let mut watchers = state
        .watchers
        .lock()
        .map_err(|e| format!("Mutex lock failed: {}", e))?;
    watchers.clear();
    Ok(())
}
