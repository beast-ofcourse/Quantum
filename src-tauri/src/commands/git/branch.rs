use serde::{Deserialize, Serialize};
use crate::commands::git::{run_git, run_git_lines, FileStat};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GitBranch {
    pub name: String,
    pub is_head: bool,
    pub is_remote: bool,
    pub upstream: Option<String>,
    pub ahead: i32,
    pub behind: i32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BranchCompareResult {
    pub ahead_commits: Vec<String>,
    pub behind_commits: Vec<String>,
    pub files: Vec<FileStat>,
    pub ahead_count: usize,
    pub behind_count: usize,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeEntry {
    pub path: String,
    pub branch: String,
    pub commit: String,
    pub is_dirty: bool,
    pub is_bare: bool,
    pub is_detached: bool,
}

#[tauri::command]
pub async fn git_branch_list(root: String) -> Result<Vec<GitBranch>, String> {
    let lines = run_git_lines(&root, &["branch", "--all", "--format=%(refname:short)%01%(HEAD)%01%(upstream:short)%01%(upstream:track)"])?;
    let mut branches = Vec::new();
    for line in lines {
        let parts: Vec<&str> = line.split('\x01').collect();
        let name = parts.first().map(|s| s.to_string()).unwrap_or_default();
        let is_head = parts.get(1).map(|s| *s == "*").unwrap_or(false);
        let upstream = parts.get(2).filter(|s| !s.is_empty()).map(|s| s.to_string());
        let track_parts = parts.get(3).unwrap_or(&"");
        let ahead = track_parts.split(',').find_map(|p| {
            let p = p.trim();
            p.strip_prefix("ahead ").and_then(|n| n.parse().ok())
        }).unwrap_or(0);
        let behind = track_parts.split(',').find_map(|p| {
            let p = p.trim();
            p.strip_prefix("behind ").and_then(|n| n.parse().ok())
        }).unwrap_or(0);
        let is_remote = name.starts_with("remotes/");
        branches.push(GitBranch { name, is_head, is_remote, upstream, ahead, behind });
    }
    Ok(branches)
}

#[tauri::command]
pub async fn git_branch_create(root: String, name: String, start_point: Option<String>) -> Result<(), String> {
    let mut args = vec!["branch".to_string(), name];
    if let Some(sp) = start_point { args.push(sp); }
    run_git(&root, &args.iter().map(|s| s.as_str()).collect::<Vec<&str>>())?;
    Ok(())
}

#[tauri::command]
pub async fn git_branch_delete(root: String, name: String, force: Option<bool>) -> Result<(), String> {
    if force.unwrap_or(false) {
        run_git(&root, &["branch", "-D", &name])?;
    } else {
        run_git(&root, &["branch", "-d", &name])?;
    }
    Ok(())
}

#[tauri::command]
pub async fn git_branch_rename(root: String, old_name: String, new_name: String) -> Result<(), String> {
    run_git(&root, &["branch", "-m", &old_name, &new_name])?;
    Ok(())
}

#[tauri::command]
pub async fn git_branch_set_upstream(root: String, branch: String, upstream: String) -> Result<(), String> {
    run_git(&root, &["branch", "--set-upstream-to", &upstream, &branch])?;
    Ok(())
}

#[tauri::command]
pub async fn git_checkout(root: String, target: String) -> Result<(), String> {
    run_git(&root, &["checkout", &target])?;
    Ok(())
}

#[tauri::command]
pub async fn git_branch_compare(
    root: String,
    base: String,
    head: String,
) -> Result<BranchCompareResult, String> {
    let ahead_count = run_git(&root, &["rev-list", "--count", &format!("{}..{}", base, head)])
        .ok()
        .and_then(|s| s.trim().parse::<usize>().ok())
        .unwrap_or(0);
    let behind_count = run_git(&root, &["rev-list", "--count", &format!("{}..{}", head, base)])
        .ok()
        .and_then(|s| s.trim().parse::<usize>().ok())
        .unwrap_or(0);

    let ahead_commits = run_git_lines(&root, &["log", "--oneline", "--no-color", &format!("{}..{}", base, head)])
        .unwrap_or_default()
        .into_iter()
        .take(100)
        .collect();
    let behind_commits = run_git_lines(&root, &["log", "--oneline", "--no-color", &format!("{}..{}", head, base)])
        .unwrap_or_default()
        .into_iter()
        .take(100)
        .collect();

    let stat_output = run_git(&root, &["diff", "--numstat", &format!("{}..{}", base, head)])
        .unwrap_or_default();
    let mut files = Vec::new();
    for line in stat_output.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() >= 3 {
            if let (Ok(added), Ok(deleted)) =
                (parts[0].parse::<usize>(), parts[1].parse::<usize>())
            {
                files.push(FileStat {
                    path: parts[2..].join("\t"),
                    added,
                    deleted,
                });
            }
        }
    }

    Ok(BranchCompareResult {
        ahead_commits,
        behind_commits,
        files,
        ahead_count,
        behind_count,
    })
}

#[tauri::command]
pub async fn git_worktree_list(root: String) -> Result<Vec<WorktreeEntry>, String> {
    let lines = run_git_lines(&root, &["worktree", "list", "--porcelain"])?;
    let mut entries = Vec::new();
    let mut i = 0;
    while i < lines.len() {
        let line = &lines[i];
        if !line.starts_with("worktree ") {
            i += 1;
            continue;
        }
        let path = line.trim_start_matches("worktree ").to_string();
        let mut branch = String::new();
        let mut commit = String::new();
        let mut is_dirty = false;
        let mut is_bare = false;
        let mut is_detached = true;
        i += 1;
        while i < lines.len() && !lines[i].starts_with("worktree ") {
            let l = &lines[i];
            if l.starts_with("HEAD ") {
                commit = l.trim_start_matches("HEAD ").to_string();
            } else if l.starts_with("branch ") {
                branch = l.trim_start_matches("branch refs/heads/").to_string();
                is_detached = false;
            } else if l.starts_with("detached") {
                is_detached = true;
            } else if l == "bare" {
                is_bare = true;
            } else if l == "dirty" {
                is_dirty = true;
            }
            i += 1;
        }
        entries.push(WorktreeEntry { path, branch, commit, is_dirty, is_bare, is_detached });
    }
    Ok(entries)
}

#[tauri::command]
pub async fn git_worktree_add(root: String, path: String, branch: Option<String>) -> Result<WorktreeEntry, String> {
    if let Some(ref b) = branch {
        let existing = run_git_lines(&root, &["worktree", "list", "--porcelain"])?;
        let mut i = 0;
        while i < existing.len() {
            if existing[i].starts_with("branch refs/heads/") {
                let branch_name = existing[i].trim_start_matches("branch refs/heads/");
                if branch_name == b {
                    return Err(format!("Branch '{}' is already checked out in another worktree", b));
                }
            }
            i += 1;
            while i < existing.len() && !existing[i].starts_with("worktree ") {
                i += 1;
            }
        }
    }
    let mut args = vec!["worktree", "add"];
    if let Some(ref b) = branch {
        args.push(&path);
        args.push(b);
    } else {
        args.push(&path);
    }
    run_git(&root, &args)?;
    let out = run_git(&root, &["rev-parse", "--short", "HEAD"])?;
    let commit = out.trim().to_string();
    let is_detached = branch.is_none();
    let branch_name = branch.unwrap_or_else(|| {
        std::path::Path::new(&path)
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default()
    });
    Ok(WorktreeEntry {
        path,
        branch: branch_name,
        commit,
        is_dirty: false,
        is_bare: false,
        is_detached,
    })
}

#[tauri::command]
pub async fn git_worktree_remove(root: String, path: String, force: Option<bool>) -> Result<(), String> {
    let mut args = vec!["worktree", "remove"];
    if force.unwrap_or(false) {
        args.push("--force");
    }
    args.push(&path);
    run_git(&root, &args)?;
    Ok(())
}

#[tauri::command]
pub async fn git_worktree_prune(root: String) -> Result<(), String> {
    run_git(&root, &["worktree", "prune"])?;
    Ok(())
}
