use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn cmd(program: &str) -> Command {
    #[cfg(target_os = "windows")]
    {
        let mut c = Command::new(program);
        c.creation_flags(CREATE_NO_WINDOW);
        c
    }
    #[cfg(not(target_os = "windows"))]
    Command::new(program)
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Shell {
    pub id: String,
    pub label: String,
    pub path: String,
    pub args: Vec<String>,
}

fn which(executable: &str) -> Option<String> {
    let path_var = std::env::var_os("PATH")?;
    let exts: Vec<String> = if cfg!(windows) {
        std::env::var("PATHEXT")
            .unwrap_or_else(|_| ".EXE;.CMD;.BAT;.COM".to_string())
            .split(';')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect()
    } else {
        vec!["".to_string()]
    };
    for dir in std::env::split_paths(&path_var) {
        for ext in &exts {
            let candidate = dir.join(format!("{}{}", executable, ext));
            if candidate.is_file() {
                return Some(candidate.to_string_lossy().into_owned());
            }
        }
    }
    None
}

fn is_wsl_available() -> bool {
    if which("wsl").is_none() {
        return false;
    }
    cmd("wsl")
        .arg("--status")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn detect_windows_shells() -> Vec<Shell> {
    let mut shells: Vec<Shell> = Vec::new();
    if let Some(path) = which("pwsh") {
        shells.push(Shell {
            id: "pwsh".into(),
            label: "PowerShell 7".into(),
            path,
            args: vec![],
        });
    }
    if let Some(path) = which("powershell") {
        shells.push(Shell {
            id: "powershell".into(),
            label: "Windows PowerShell".into(),
            path,
            args: vec![],
        });
    }
    if let Some(path) = which("cmd") {
        shells.push(Shell {
            id: "cmd".into(),
            label: "Command Prompt".into(),
            path,
            args: vec![],
        });
    }
    if is_wsl_available() {
        shells.push(Shell {
            id: "wsl".into(),
            label: "WSL".into(),
            path: which("wsl").unwrap_or_else(|| "wsl".into()),
            args: vec![],
        });
    }
    shells
}

fn parse_etc_shells(content: &str) -> Vec<String> {
    content
        .lines()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty() && !s.starts_with('#'))
        .filter(|s| Path::new(s).is_file())
        .map(|s| s.to_string())
        .collect()
}

fn detect_unix_shells() -> Vec<Shell> {
    let content = std::fs::read_to_string("/etc/shells").unwrap_or_default();
    let mut entries = parse_etc_shells(&content);
    if let Ok(shell_env) = std::env::var("SHELL") {
        if Path::new(&shell_env).is_file() {
            entries.retain(|s| s != &shell_env);
            entries.insert(0, shell_env);
        }
    }
    if entries.is_empty() {
        if let Some(path) = which("bash") {
            entries.push(path);
        } else if let Some(path) = which("sh") {
            entries.push(path);
        }
    }
    entries
        .into_iter()
        .enumerate()
        .map(|(i, path)| {
            let label = Path::new(&path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(&path)
                .to_string();
            let id = if i == 0 {
                label.clone()
            } else {
                format!("{}-{}", label, i)
            };
            Shell {
                id,
                label,
                path,
                args: vec![],
            }
        })
        .collect()
}

#[tauri::command]
pub async fn detect_shells() -> Result<Vec<Shell>, String> {
    let shells = if cfg!(windows) {
        detect_windows_shells()
    } else {
        detect_unix_shells()
    };
    Ok(shells)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_etc_shells_skips_blanks_and_comments() {
        let input = "# valid login shells\n/bin/sh\n\n/bin/bash\n# trailing\n";
        let parsed = parse_etc_shells(input);
        assert_eq!(parsed, vec!["/bin/sh", "/bin/bash"]);
    }

    #[test]
    #[cfg(unix)]
    fn parse_etc_shells_skips_missing_paths() {
        let input = "/bin/sh\n/nonexistent/shell\n/bin/bash\n";
        let parsed = parse_etc_shells(input);
        assert_eq!(parsed, vec!["/bin/sh", "/bin/bash"]);
    }

    #[test]
    #[cfg(unix)]
    fn which_finds_common_executables() {
        let probe = "sh";
        let result = which(probe);
        assert!(result.is_some(), "expected to find {}", probe);
    }

    #[test]
    #[cfg(windows)]
    fn which_finds_common_executables_windows() {
        let probe = "cmd";
        let result = which(probe);
        assert!(result.is_some(), "expected to find {}", probe);
    }
}
