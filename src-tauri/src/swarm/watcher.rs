use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebouncedEvent};
use serde::Serialize;
use std::path::Path;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// Payload emitted when a manifest file is successfully parsed.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestChangedPayload {
    pub agent_id: String,
    pub manifest: super::state::AgentManifest,
}

/// Start the file system watcher for agent manifest files.
///
/// Watches `.quantum/agents/` recursively.
/// When a `manifest.json` file is written by an agent, parses it and emits
/// `swarm:manifest-changed` or `swarm:manifest-parse-error` events.
pub fn start_swarm_watcher(app: AppHandle, project_root: String) {
    std::thread::spawn(move || {
        let watch_path = format!("{}/.quantum/agents", project_root);
        let watch_dir = Path::new(&watch_path);

        // If the directory doesn't exist yet, wait and retry
        if !watch_dir.exists() {
            std::thread::sleep(Duration::from_millis(500));
            std::fs::create_dir_all(watch_dir).ok();
        }

        let (tx, rx) = std::sync::mpsc::channel();

        let mut debouncer = match new_debouncer(Duration::from_millis(150), tx) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("[swarm-watcher] Failed to create debouncer: {:?}", e);
                return;
            }
        };

        if let Err(e) = debouncer
            .watcher()
            .watch(watch_dir, RecursiveMode::Recursive)
        {
            eprintln!(
                "[swarm-watcher] Failed to watch directory: {:?}",
                e
            );
            return;
        }

        // Keep debouncer alive (ownership)
        let _debouncer = debouncer;

        for result in rx {
            match result {
                Ok(events) => {
                    for event in events {
                        handle_fs_event(&app, &event);
                    }
                }
                Err(e) => {
                    eprintln!("[swarm-watcher] Error: {:?}", e);
                }
            }
        }
    });
}

fn handle_fs_event(app: &AppHandle, event: &DebouncedEvent) {
    let path = &event.path;

    // Only care about manifest.json files
    if path.file_name().and_then(|n| n.to_str()) != Some("manifest.json") {
        return;
    }

    // Extract agent ID from path: .quantum/agents/<agent-id>/manifest.json
    let agent_id = path
        .parent()
        .and_then(|p| p.file_name())
        .and_then(|n| n.to_str())
        .map(String::from);

    let Some(agent_id) = agent_id else {
        return;
    };

    // Read and validate manifest
    match std::fs::read_to_string(path) {
        Ok(content) => {
            match serde_json::from_str::<super::state::AgentManifest>(&content) {
                Ok(manifest) => {
                    let payload = ManifestChangedPayload {
                        agent_id,
                        manifest,
                    };
                    let _ = app.emit("swarm:manifest-changed", payload);
                }
                Err(e) => {
                    eprintln!(
                        "[swarm-watcher] Manifest parse error for {}: {}",
                        agent_id, e
                    );
                    // Emit parse error event so UI can show error state
                    let _ = app.emit("swarm:manifest-parse-error", &agent_id);
                }
            }
        }
        Err(e) => {
            // Stale read (e.g., partial write) — skip, next debounce will catch it
            eprintln!(
                "[swarm-watcher] Manifest read error for {}: {}",
                agent_id, e
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::swarm::state::AgentManifest;

    #[test]
    fn test_manifest_parse_valid() {
        let json = r#"{"status":"running","currentThought":"Refactoring auth","filesModified":["src/auth.ts"],"error":null}"#;
        let manifest: AgentManifest = serde_json::from_str(json).unwrap();
        assert_eq!(manifest.status, "running");
        assert_eq!(manifest.current_thought, "Refactoring auth");
        assert_eq!(manifest.files_modified, vec!["src/auth.ts"]);
        assert_eq!(manifest.error, None);
    }

    #[test]
    fn test_manifest_parse_minimal() {
        let json = r#"{"status":"done"}"#;
        let manifest: AgentManifest = serde_json::from_str(json).unwrap();
        assert_eq!(manifest.status, "done");
        assert!(manifest.current_thought.is_empty());
        assert!(manifest.files_modified.is_empty());
        assert_eq!(manifest.error, None);
    }

    #[test]
    fn test_manifest_parse_invalid_json() {
        let json = r#"{invalid json}"#;
        let result: Result<AgentManifest, _> = serde_json::from_str(json);
        assert!(result.is_err());
    }

    #[test]
    fn test_manifest_parse_with_error() {
        let json = r#"{"status":"failed","error":"Something broke"}"#;
        let manifest: AgentManifest = serde_json::from_str(json).unwrap();
        assert_eq!(manifest.status, "failed");
        assert_eq!(manifest.error, Some("Something broke".into()));
    }

    #[test]
    fn test_manifest_payload_serde() {
        let manifest = AgentManifest {
            status: "running".into(),
            current_thought: "working".into(),
            files_modified: vec!["a.ts".into()],
            error: None,
        };
        let payload = ManifestChangedPayload {
            agent_id: "agent-1".into(),
            manifest,
        };
        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("agent-1"));
        assert!(json.contains("working"));
        assert!(json.contains("agentId") || json.contains("agent_id"));
    }
}
