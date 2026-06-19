pub mod commands;
pub mod git;
pub mod keyring;
pub mod state;
pub mod watcher;

use serde::Serialize;

#[derive(thiserror::Error, Debug)]
#[allow(dead_code)]
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_swarm_error_display() {
        let err = SwarmError::Io(std::io::Error::new(std::io::ErrorKind::NotFound, "file not found"));
        assert!(err.to_string().contains("file not found"));

        let err = SwarmError::Json(serde_json::from_str::<()>("invalid").unwrap_err());
        assert!(err.to_string().contains("JSON"));

        let err = SwarmError::Git { stdout: "".into(), stderr: "conflict".into(), exit_code: 1 };
        assert!(err.to_string().contains("conflict"));

        let err = SwarmError::Keyring("storage unavailable".into());
        assert!(err.to_string().contains("storage"));

        let err = SwarmError::WorktreeExists("/path".into());
        assert!(err.to_string().contains("/path"));

        let err = SwarmError::AgentNotFound("agent-1".into());
        assert!(err.to_string().contains("agent-1"));

        let err = SwarmError::StateParse("bad json".into());
        assert!(err.to_string().contains("bad json"));
    }

    #[test]
    fn test_swarm_error_serialize() {
        let err = SwarmError::AgentNotFound("agent-1".into());
        let json = serde_json::to_string(&err).unwrap();
        assert_eq!(json, "\"Agent not found: agent-1\"");
    }

    #[test]
    fn test_swarm_error_from_io() {
        let io_err = std::io::Error::new(std::io::ErrorKind::PermissionDenied, "denied");
        let swarm_err: SwarmError = io_err.into();
        assert!(matches!(swarm_err, SwarmError::Io(_)));
    }

    #[test]
    fn test_swarm_error_from_json() {
        let json_err = serde_json::from_str::<()>("").unwrap_err();
        let swarm_err: SwarmError = json_err.into();
        assert!(matches!(swarm_err, SwarmError::Json(_)));
    }
}
