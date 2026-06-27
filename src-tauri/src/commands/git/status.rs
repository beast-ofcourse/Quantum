use serde::{Deserialize, Serialize};
use crate::commands::git::{cmd, run_git, run_git_lines};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GitFileEntry {
    pub path: String,
    pub status: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub branch: String,
    pub ahead: i32,
    pub behind: i32,
    pub staged: Vec<GitFileEntry>,
    pub unstaged: Vec<GitFileEntry>,
    pub untracked: Vec<String>,
    pub conflicted: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GitSubmodule {
    pub path: String,
    pub url: String,
    pub commit: String,
    pub is_dirty: bool,
}

#[tauri::command]
pub async fn git_status(root: String) -> Result<GitStatus, String> {
    let out = run_git(&root, &["status", "--porcelain=v2", "--branch"])?;
    let mut status = GitStatus {
        branch: String::new(),
        ahead: 0,
        behind: 0,
        staged: Vec::new(),
        unstaged: Vec::new(),
        untracked: Vec::new(),
        conflicted: Vec::new(),
    };
    for line in out.lines() {
        let line = line.trim();
        if line.is_empty() { continue; }
        if line.starts_with("# branch.head ") {
            status.branch = line.trim_start_matches("# branch.head ").to_string();
        } else if line.starts_with("# branch.ab ") {
            let rest = line.trim_start_matches("# branch.ab ");
            let parts: Vec<&str> = rest.split_whitespace().collect();
            if parts.len() >= 1 { status.ahead = parts[0].trim_start_matches('+').parse().unwrap_or(0); }
            if parts.len() >= 2 { status.behind = parts[1].trim_start_matches('-').parse().unwrap_or(0); }
        } else if line.starts_with('1') {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 8 {
                let xycodes = parts[1];
                let path = parts[7..].join(" ").trim_start_matches('"').trim_end_matches('"').to_string();
                let staged_char = xycodes.chars().next().unwrap_or(' ');
                let unstaged_char = xycodes.chars().nth(1).unwrap_or(' ');
                let to_status = |c: char| -> &'static str {
                    match c { 'M' => "modified", 'A' => "added", 'D' => "deleted", 'R' => "renamed", 'C' => "copied", _ => "modified" }
                };
                if staged_char != ' ' && staged_char != '.' { status.staged.push(GitFileEntry { path: path.clone(), status: to_status(staged_char).to_string() }); }
                if unstaged_char != ' ' && unstaged_char != '.' { status.unstaged.push(GitFileEntry { path: path.clone(), status: to_status(unstaged_char).to_string() }); }
                if staged_char == 'U' || unstaged_char == 'U' { status.conflicted.push(path); }
            }
        } else if line.starts_with('2') {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 9 {
                let xycodes = parts[1];
                let path = parts[8..].join(" ").trim_start_matches('"').trim_end_matches('"').to_string();
                let staged_char = xycodes.chars().next().unwrap_or(' ');
                let unstaged_char = xycodes.chars().nth(1).unwrap_or(' ');
                let to_status = |c: char| -> &'static str {
                    match c { 'M' => "modified", 'A' => "added", 'D' => "deleted", 'R' => "renamed", 'C' => "copied", _ => "modified" }
                };
                if staged_char != ' ' && staged_char != '.' { status.staged.push(GitFileEntry { path: path.clone(), status: to_status(staged_char).to_string() }); }
                if unstaged_char != ' ' && unstaged_char != '.' { status.unstaged.push(GitFileEntry { path: path.clone(), status: to_status(unstaged_char).to_string() }); }
                if staged_char == 'U' || unstaged_char == 'U' { status.conflicted.push(path); }
            }
        } else if line.starts_with('u') {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 { status.conflicted.push(parts[1..].join(" ")); }
        } else if line.starts_with('?') {
            let path = line.trim_start_matches('?').trim().to_string();
            if !path.is_empty() { status.untracked.push(path); }
        }
    }
    Ok(status)
}

#[tauri::command]
pub async fn git_submodule_status(root: String) -> Result<Vec<GitSubmodule>, String> {
    let lines = run_git_lines(&root, &["submodule", "status"]).unwrap_or_default();
    let mut subs = Vec::new();
    for line in lines {
        let line = line.trim();
        if line.is_empty() { continue; }
        let is_dirty = line.starts_with('-') || line.starts_with('+');
        let cleaned = line.trim_start_matches('-').trim_start_matches('+').trim_start_matches(' ');
        let parts: Vec<&str> = cleaned.splitn(3, ' ').collect();
        if parts.len() >= 3 {
            subs.push(GitSubmodule {
                commit: parts[0].to_string(), path: parts[1].to_string(),
                url: parts[2].trim_start_matches('(').trim_end_matches(')').to_string(), is_dirty,
            });
        }
    }
    Ok(subs)
}

#[tauri::command]
pub async fn git_init(root: String) -> Result<(), String> {
    run_git(&root, &["init"])?;
    Ok(())
}

#[tauri::command]
pub async fn git_is_repo(root: String) -> Result<bool, String> {
    let output = cmd("git")
        .args(["rev-parse", "--git-dir"])
        .current_dir(&root)
        .output()
        .map_err(|e| format!("Git check failed: {}", e))?;
    Ok(output.status.success())
}
