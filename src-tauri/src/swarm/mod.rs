pub mod commands;
pub mod git;
pub mod keyring;
pub mod state;
pub mod watcher;

use serde::Serialize;

#[derive(thiserror::Error, Debug)]
pub enum SwarmError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Git command failed: {stderr}")]
    Git {
        stdout: String,
        stderr: String,
        exit_code: i32,
    },

    #[error("Keyring error: {0}")]
    Keyring(String),

    #[error("Worktree already exists: {0}")]
    WorktreeExists(String),

    #[error("Agent not found: {0}")]
    AgentNotFound(String),

    #[error("State parse error: {0}")]
    StateParse(String),
}

impl Serialize for SwarmError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
