use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

// ── Enums ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SwarmPhase {
    Planning,
    Executing,
    Merging,
    Conflict,
    Done,
}

impl Default for SwarmPhase {
    fn default() -> Self {
        Self::Planning
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AgentType {
    Opencode,
    Kilocode,
}

impl std::fmt::Display for AgentType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Opencode => write!(f, "opencode"),
            Self::Kilocode => write!(f, "kilocode"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AgentStatus {
    Idle,
    Running,
    Waiting,
    Merging,
    Done,
    Failed,
    Dead,
}

impl Default for AgentStatus {
    fn default() -> Self {
        Self::Idle
    }
}

// ── Config ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuickPreset {
    pub agent: String,
    pub model: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmConfig {
    #[serde(default = "default_agent")]
    pub default_agent: String,

    #[serde(default = "default_model")]
    pub default_model: String,

    #[serde(default = "default_quick_presets")]
    pub quick_presets: Vec<QuickPreset>,

    #[serde(default = "default_model_options")]
    pub model_options: HashMap<String, Vec<String>>,
}

fn default_agent() -> String {
    "opencode".to_string()
}

fn default_model() -> String {
    "deepseek-v4-flash-free".to_string()
}

fn default_quick_presets() -> Vec<QuickPreset> {
    vec![
        QuickPreset {
            agent: "opencode".into(),
            model: "deepseek-v4-flash-free".into(),
            label: "OpenCode · DeepSeek V4 Flash Free".into(),
        },
        QuickPreset {
            agent: "kilocode".into(),
            model: "deepseek-v4-flash-free".into(),
            label: "KiloCode · DeepSeek V4 Flash Free".into(),
        },
    ]
}

fn default_model_options() -> HashMap<String, Vec<String>> {
    let mut m = HashMap::new();
    m.insert(
        "opencode".into(),
        vec![
            "deepseek-v4-flash-free".into(),
            "deepseek-v4-flash".into(),
        ],
    );
    m.insert(
        "kilocode".into(),
        vec![
            "deepseek-v4-flash-free".into(),
            "deepseek-v4-flash".into(),
        ],
    );
    m
}

impl Default for SwarmConfig {
    fn default() -> Self {
        Self {
            default_agent: default_agent(),
            default_model: default_model(),
            quick_presets: default_quick_presets(),
            model_options: default_model_options(),
        }
    }
}

// ── Manifest ───────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentManifest {
    #[serde(default)]
    pub status: String,

    #[serde(default)]
    pub current_thought: String,

    #[serde(default)]
    pub files_modified: Vec<String>,

    #[serde(default)]
    pub error: Option<String>,
}

// ── Agent ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentInfo {
    pub id: String,
    #[serde(rename = "type")]
    pub agent_type: AgentType,
    pub model: String,
    pub task_id: String,
    #[serde(default)]
    pub status: AgentStatus,
    pub pid: Option<i32>,
    pub session_id: Option<String>,
    pub worktree_path: String,
    pub branch: String,
    #[serde(default)]
    pub depends_on: Vec<String>,
    pub heartbeat_at: Option<String>,
    pub exit_code: Option<i32>,
    #[serde(default)]
    pub manifest: serde_json::Value,
}

// ── Task ───────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub description: String,
    #[serde(default)]
    pub status: String,
    pub assigned_to: Option<String>,
    #[serde(default)]
    pub depends_on: Vec<String>,
    #[serde(default = "default_priority")]
    pub priority: i32,
}

fn default_priority() -> i32 {
    0
}

// ── File Lock ──────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileLock {
    pub locked_by: String,
    pub locked_at: String,
}

// ── Merge Queue ────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeQueueItem {
    pub agent_id: String,
    pub branch: String,
    pub task_id: String,
    #[serde(default)]
    pub status: String,
}

// ── Timeline Event ─────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineEvent {
    pub t: String,
    pub agent: String,
    pub r#type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file: Option<String>,
}

// ── Main State ─────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmState {
    pub version: i32,
    pub swarm_id: String,
    pub name: String,
    pub created_at: String,
    #[serde(default)]
    pub phase: SwarmPhase,
    pub config: SwarmConfig,
    #[serde(default)]
    pub agents: HashMap<String, AgentInfo>,
    #[serde(default)]
    pub tasks: Vec<Task>,
    #[serde(default)]
    pub file_locks: HashMap<String, FileLock>,
    #[serde(default)]
    pub merge_queue: Vec<MergeQueueItem>,
}

impl SwarmState {
    pub fn new(swarm_id: String, name: String) -> Self {
        Self {
            version: 1,
            swarm_id,
            name,
            created_at: chrono_now(),
            phase: SwarmPhase::Planning,
            config: SwarmConfig::default(),
            agents: HashMap::new(),
            tasks: Vec::new(),
            file_locks: HashMap::new(),
            merge_queue: Vec::new(),
        }
    }

    /// Validate state integrity. Returns first error found.
    #[allow(dead_code)]
    pub fn validate(&self) -> Result<(), String> {
        if self.version < 1 {
            return Err(format!("Invalid version: {}", self.version));
        }
        if self.swarm_id.is_empty() {
            return Err("swarm_id is required".into());
        }
        if self.name.is_empty() {
            return Err("name is required".into());
        }
        if self.created_at.is_empty() {
            return Err("created_at is required".into());
        }
        // Validate agents
        for (id, agent) in &self.agents {
            if agent.id.is_empty() {
                return Err(format!("Agent {} has empty id", id));
            }
            if agent.worktree_path.is_empty() {
                return Err(format!("Agent {} has empty worktree_path", id));
            }
        }
        // Validate tasks
        for task in &self.tasks {
            if task.id.is_empty() {
                return Err("Task has empty id".into());
            }
            if task.description.is_empty() {
                return Err(format!("Task {} has empty description", task.id));
            }
        }
        Ok(())
    }
}

// ── Task Spec (for commands) ───────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskSpec {
    pub description: String,
    pub agent_type: String,
    pub model: String,
    #[serde(default)]
    pub depends_on: Vec<String>,
}

// ── Merge Check Result ─────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeCheckResult {
    pub has_conflict: bool,
    #[serde(default)]
    pub conflict_files: Vec<String>,
}

// ── Reconciliation Report ──────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReconciliationReport {
    pub revived: Vec<String>,
    pub dead: Vec<String>,
    pub resumed_merges: Vec<String>,
}

// ── SwarmManager (Tauri State) ─────────────────────────

#[allow(dead_code)]
pub struct SwarmManager {
    pub state: Arc<RwLock<SwarmState>>,
    pub project_root: RwLock<String>,
}

#[allow(dead_code)]
impl SwarmManager {
    pub fn new(project_root: String, state: SwarmState) -> Self {
        Self {
            state: Arc::new(RwLock::new(state)),
            project_root: RwLock::new(project_root),
        }
    }
}

// ── Helpers ────────────────────────────────────────────

fn chrono_now() -> String {
    // Simple ISO-8601 without adding chrono crate
    use std::time::{SystemTime, UNIX_EPOCH};
    let dur = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = dur.as_secs();
    // Convert to ISO 8601: YYYY-MM-DDTHH:MM:SS.sssZ
    let days = secs / 86400;
    let time_secs = secs % 86400;
    let hours = time_secs / 3600;
    let minutes = (time_secs % 3600) / 60;
    let seconds = time_secs % 60;

    // Days since epoch to year/month/day (simplified)
    let mut y = 1970i64;
    let mut d = days as i64;
    loop {
        let days_in_year = if is_leap(y) { 366 } else { 365 };
        if d < days_in_year {
            break;
        }
        d -= days_in_year;
        y += 1;
    }
    let month_days = if is_leap(y) {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    let mut m = 0;
    for (i, &md) in month_days.iter().enumerate() {
        if d < md {
            m = i + 1;
            break;
        }
        d -= md;
    }
    let day = d + 1;
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.000Z",
        y, m, day, hours, minutes, seconds
    )
}

fn is_leap(year: i64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_swarm_state_new() {
        let state = SwarmState::new("swarm_test".into(), "Test Swarm".into());
        assert_eq!(state.version, 1);
        assert_eq!(state.swarm_id, "swarm_test");
        assert_eq!(state.name, "Test Swarm");
        assert_eq!(state.phase, SwarmPhase::Planning);
        assert!(state.agents.is_empty());
        assert!(state.tasks.is_empty());
    }

    #[test]
    fn test_swarm_state_validate_ok() {
        let state = SwarmState::new("swarm_test".into(), "Test Swarm".into());
        assert!(state.validate().is_ok());
    }

    #[test]
    fn test_swarm_state_validate_version() {
        let mut state = SwarmState::new("swarm_test".into(), "Test Swarm".into());
        state.version = 0;
        assert!(state.validate().is_err());
        assert!(state.validate().unwrap_err().contains("version"));
    }

    #[test]
    fn test_swarm_state_validate_empty_swarm_id() {
        let state = SwarmState::new("".into(), "Test Swarm".into());
        assert!(state.validate().is_err());
    }

    #[test]
    fn test_swarm_state_validate_empty_name() {
        let state = SwarmState::new("swarm_test".into(), "".into());
        assert!(state.validate().is_err());
    }

    #[test]
    fn test_json_round_trip() {
        let state = SwarmState::new("swarm_test".into(), "Test Swarm".into());
        let json = serde_json::to_string_pretty(&state).unwrap();
        let deserialized: SwarmState = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.swarm_id, "swarm_test");
        assert_eq!(deserialized.name, "Test Swarm");
        assert!(deserialized.validate().is_ok());
    }

    #[test]
    fn test_agent_type_display() {
        assert_eq!(AgentType::Opencode.to_string(), "opencode");
        assert_eq!(AgentType::Kilocode.to_string(), "kilocode");
    }

    #[test]
    fn test_swarm_phase_default() {
        assert_eq!(SwarmPhase::default(), SwarmPhase::Planning);
    }

    #[test]
    fn test_swarm_config_default() {
        let config = SwarmConfig::default();
        assert_eq!(config.default_agent, "opencode");
        assert_eq!(config.default_model, "deepseek-v4-flash-free");
        assert_eq!(config.quick_presets.len(), 2);
    }

    #[test]
    fn test_generate_swarm_id() {
        let id = generate_swarm_id();
        assert!(id.starts_with("swarm_"));
        assert_eq!(id.len(), 13); // "swarm_" + 8 chars
    }

    #[test]
    fn test_chrono_now_format() {
        let now = chrono_now();
        // Should be ISO 8601 format: YYYY-MM-DDTHH:MM:SS.sssZ
        assert_eq!(now.len(), 24);
        assert!(now.ends_with(".000Z"));
        assert!(now.contains('T'));
    }

    #[test]
    fn test_agent_info_serde() {
        let agent = AgentInfo {
            id: "agent-1".into(),
            agent_type: AgentType::Opencode,
            model: "deepseek-v4-flash-free".into(),
            task_id: "task-1".into(),
            status: AgentStatus::Running,
            pid: Some(12345),
            session_id: Some("term_abc".into()),
            worktree_path: "/tmp/worktree".into(),
            branch: "swarm/agent-1".into(),
            depends_on: vec![],
            heartbeat_at: Some("2026-01-01T00:00:00.000Z".into()),
            exit_code: None,
            manifest: serde_json::json!({"status": "running"}),
        };
        let json = serde_json::to_string(&agent).unwrap();
        assert!(json.contains("agent-1"));
        assert!(json.contains("opencode"));
        let deserialized: AgentInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, "agent-1");
        assert_eq!(deserialized.status, AgentStatus::Running);
    }
}

/// Generate a short swarm ID like "swarm_2xkt9m4j"
pub fn generate_swarm_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let dur = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let hash = dur.as_nanos();
    let chars: Vec<char> = "abcdefghijklmnopqrstuvwxyz0123456789".chars().collect();
    let mut id = String::with_capacity(12);
    let mut h = hash;
    for _ in 0..8 {
        id.push(chars[(h % 36) as usize]);
        h /= 36;
    }
    format!("swarm_{}", id)
}
