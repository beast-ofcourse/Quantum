use serde::{Deserialize, Serialize};
use std::io::Write;
use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x08000000;

fn cmd(program: &str) -> Command {
    let mut c = Command::new(program);
    #[cfg(target_os = "windows")]
    c.creation_flags(CREATE_NO_WINDOW);
    c
}

fn unix_to_rfc3339(ts: i64) -> String {
    let mut s = if ts >= 0 { ts as u64 } else { return String::new(); };
    let sec = s % 60;
    s /= 60;
    let min = s % 60;
    s /= 60;
    let hour = s % 24;
    let days = s / 24;
    let mut y = 1970i64;
    let mut d = days as i64;
    loop {
        let leap = (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0);
        let diy = if leap { 366 } else { 365 };
        if d < diy { break; }
        d -= diy;
        y += 1;
    }
    let leap = (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0);
    let month_days: [i64; 12] = if leap { [31,29,31,30,31,30,31,31,30,31,30,31] } else { [31,28,31,30,31,30,31,31,30,31,30,31] };
    let mut mo = 1u32;
    for &md in &month_days {
        if d < md { break; }
        d -= md;
        mo += 1;
    }
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}+00:00", y, mo, d + 1, hour, min, sec)
}

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
pub struct GitCommit {
    pub hash: String,
    pub author_name: String,
    pub author_email: String,
    pub date: String,
    pub message: String,
    pub parents: Vec<String>,
    pub refs: String,
}

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
pub struct GitRemote {
    pub name: String,
    pub fetch_url: Option<String>,
    pub push_url: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GitStash {
    pub index: usize,
    pub message: String,
    pub branch: String,
    pub hash: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GitBlameLine {
    pub line: usize,
    pub hash: String,
    pub author: String,
    pub author_email: String,
    pub date: String,
    pub message: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GitSubmodule {
    pub path: String,
    pub url: String,
    pub commit: String,
    pub is_dirty: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiffHunk {
    pub index: usize,
    pub old_start: usize,
    pub old_lines: usize,
    pub new_start: usize,
    pub new_lines: usize,
    pub section_header: String,
    pub lines: Vec<DiffLine>,
    pub file_path: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    pub content: String,
    pub old_line_number: Option<usize>,
    pub new_line_number: Option<usize>,
    #[serde(rename = "type")]
    pub line_type: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LineSelection {
    pub hunk_index: usize,
    pub line_indices: Vec<usize>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GraphData {
    pub nodes: Vec<GraphNode>,
    pub refs: Vec<GraphRef>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GraphNode {
    pub hash: String,
    pub parents: Vec<String>,
    pub message: String,
    pub author: String,
    pub date: String,
    pub children: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GraphRef {
    pub hash: String,
    pub name: String,
    pub ref_type: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CommitDetail {
    pub hash: String,
    pub message: String,
    pub author_name: String,
    pub author_email: String,
    pub date: String,
    pub committer: String,
    pub stats: Vec<FileStat>,
    pub diff: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileStat {
    pub path: String,
    pub added: usize,
    pub deleted: usize,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct LogOptions {
    pub max_count: Option<u32>,
    pub before_hash: Option<String>,
    pub path: Option<String>,
    pub author: Option<String>,
    pub since: Option<String>,
    pub until: Option<String>,
}

// ── Phase 4: Tags, Cherry-Pick, Revert & Branch Compare ──

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GitTag {
    pub name: String,
    pub hash: String,
    pub date: String,
    pub message: String,
    pub is_annotated: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct CherryPickOptions {
    pub no_commit: Option<bool>,
    pub strategy_theirs: Option<bool>,
    pub hashes: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CherryPickStatus {
    pub in_progress: bool,
    pub current_hash: String,
    pub has_conflict: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct RevertOptions {
    pub no_commit: Option<bool>,
    pub parent_number: Option<u32>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RevertStatus {
    pub in_progress: bool,
    pub current_hash: String,
    pub has_conflict: bool,
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

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct StashOptions {
    pub paths: Option<Vec<String>>,
    pub message: Option<String>,
    pub keep_index: Option<bool>,
    pub staged: Option<bool>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct StashApplyResult {
    pub success: bool,
    pub has_conflict: bool,
    pub conflicted_files: Vec<String>,
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

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BisectStatus {
    pub in_progress: bool,
    pub step: String,
    pub current_hash: String,
    pub current_message: String,
    pub remaining: usize,
    pub total: usize,
    pub first_bad_hash: Option<String>,
    pub first_bad_message: Option<String>,
    pub log: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BisectStartOptions {
    pub bad: String,
    pub good: String,
    pub paths: Option<Vec<String>>,
}

#[tauri::command]
pub async fn git_tag_list(root: String) -> Result<Vec<GitTag>, String> {
    let out = run_git(
        &root,
        &[
            "tag",
            "--list",
            "--format=%(refname:short)|%(objectname)|%(taggerdate)|%(contents:subject)",
        ],
    )?;
    let mut tags = Vec::new();
    for line in out.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.splitn(4, '|').collect();
        if parts.len() < 2 {
            continue;
        }
        let name = parts[0].to_string();
        let hash = parts[1].to_string();
        let date = parts.get(2).unwrap_or(&"").trim().to_string();
        let message = parts.get(3).unwrap_or(&"").trim().to_string();
        let is_annotated = !date.is_empty();
        tags.push(GitTag {
            name,
            hash,
            date,
            message,
            is_annotated,
        });
    }
    Ok(tags)
}

#[tauri::command]
pub async fn git_tag_create(
    root: String,
    name: String,
    message: String,
    commit: String,
    annotated: Option<bool>,
) -> Result<(), String> {
    if annotated.unwrap_or(true) {
        run_git(&root, &["tag", "-a", &name, "-m", &message, &commit])?;
    } else {
        run_git(&root, &["tag", &name, &commit])?;
    }
    Ok(())
}

#[tauri::command]
pub async fn git_tag_delete(root: String, name: String) -> Result<(), String> {
    run_git(&root, &["tag", "-d", &name])?;
    Ok(())
}

#[tauri::command]
pub async fn git_tag_push(
    root: String,
    name: String,
    remote: Option<String>,
    token: Option<String>,
) -> Result<(), String> {
    let remote_name = remote.unwrap_or_else(|| "origin".to_string());
    let args = vec!["push".to_string(), remote_name, name];
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let output = if let Some(ref t) = token {
        let env_val = format!("http.extraHeader=Authorization: bearer {}", t);
        cmd("git")
            .args(&refs)
            .current_dir(&root)
            .env("GIT_CONFIG_PARAMETERS", format!("'{}'", env_val))
            .output()
            .map_err(|e| format!("Git command failed: {}", e))?
    } else {
        cmd("git")
            .args(&refs)
            .current_dir(&root)
            .output()
            .map_err(|e| format!("Git command failed: {}", e))?
    };
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(stderr.trim().to_string());
    }
    Ok(())
}

fn detect_cherry_pick_state(root: &str) -> Result<CherryPickStatus, String> {
    let git_dir = run_git(root, &["rev-parse", "--git-dir"])?.trim().to_string();
    let cherry_pick_head = std::path::Path::new(&git_dir).join("CHERRY_PICK_HEAD");
    if !cherry_pick_head.exists() {
        return Ok(CherryPickStatus {
            in_progress: false,
            current_hash: String::new(),
            has_conflict: false,
        });
    }
    let current_hash =
        std::fs::read_to_string(&cherry_pick_head).unwrap_or_default().trim().to_string();
    let has_conflict = run_git(root, &["diff", "--name-only", "--diff-filter=U"])
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    Ok(CherryPickStatus {
        in_progress: true,
        current_hash,
        has_conflict,
    })
}

#[tauri::command]
pub async fn git_cherry_pick(
    root: String,
    hash: String,
    options: Option<CherryPickOptions>,
) -> Result<CherryPickStatus, String> {
    let status = run_git(&root, &["status", "--porcelain"])?;
    if !status.trim().is_empty() {
        return Err("Uncommitted changes — commit or stash before cherry-picking".to_string());
    }
    let opts = options.unwrap_or_default();
    let mut args = vec!["cherry-pick".to_string()];
    if opts.no_commit.unwrap_or(false) {
        args.push("--no-commit".to_string());
    }
    if opts.strategy_theirs.unwrap_or(false) {
        args.push("-X".to_string());
        args.push("theirs".to_string());
    }
    if let Some(hashes) = &opts.hashes {
        for h in hashes {
            args.push(h.clone());
        }
    } else {
        args.push(hash);
    }
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let output = cmd("git")
        .args(&refs)
        .current_dir(&root)
        .output()
        .map_err(|e| format!("Git command failed: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let state = detect_cherry_pick_state(&root)?;
        if state.in_progress {
            return Ok(state);
        }
        return Err(stderr.trim().to_string());
    }
    detect_cherry_pick_state(&root)
}

#[tauri::command]
pub async fn git_cherry_pick_detect(root: String) -> Result<CherryPickStatus, String> {
    detect_cherry_pick_state(&root)
}

#[tauri::command]
pub async fn git_cherry_pick_continue(root: String) -> Result<CherryPickStatus, String> {
    let output = cmd("git")
        .args(["cherry-pick", "--continue"])
        .current_dir(&root)
        .output()
        .map_err(|e| format!("Git command failed: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let state = detect_cherry_pick_state(&root)?;
        if state.in_progress {
            return Ok(state);
        }
        return Err(stderr.trim().to_string());
    }
    detect_cherry_pick_state(&root)
}

#[tauri::command]
pub async fn git_cherry_pick_abort(root: String) -> Result<CherryPickStatus, String> {
    let output = cmd("git")
        .args(["cherry-pick", "--abort"])
        .current_dir(&root)
        .output()
        .map_err(|e| format!("Git command failed: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(stderr.trim().to_string());
    }
    Ok(CherryPickStatus {
        in_progress: false,
        current_hash: String::new(),
        has_conflict: false,
    })
}

fn detect_revert_state(root: &str) -> Result<RevertStatus, String> {
    let git_dir = run_git(root, &["rev-parse", "--git-dir"])?.trim().to_string();
    let revert_head = std::path::Path::new(&git_dir).join("REVERT_HEAD");
    if !revert_head.exists() {
        return Ok(RevertStatus {
            in_progress: false,
            current_hash: String::new(),
            has_conflict: false,
        });
    }
    let current_hash =
        std::fs::read_to_string(&revert_head).unwrap_or_default().trim().to_string();
    let has_conflict = run_git(root, &["diff", "--name-only", "--diff-filter=U"])
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    Ok(RevertStatus {
        in_progress: true,
        current_hash,
        has_conflict,
    })
}

#[tauri::command]
pub async fn git_revert(
    root: String,
    hash: String,
    options: Option<RevertOptions>,
) -> Result<RevertStatus, String> {
    let status = run_git(&root, &["status", "--porcelain"])?;
    if !status.trim().is_empty() {
        return Err("Uncommitted changes — commit or stash before reverting".to_string());
    }
    let opts = options.unwrap_or_default();
    let mut args = vec!["revert".to_string()];
    if opts.no_commit.unwrap_or(false) {
        args.push("--no-commit".to_string());
    }
    if let Some(pn) = opts.parent_number {
        args.push("-m".to_string());
        args.push(pn.to_string());
    }
    args.push("--no-edit".to_string());
    args.push(hash);
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let output = cmd("git")
        .args(&refs)
        .current_dir(&root)
        .output()
        .map_err(|e| format!("Git command failed: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let state = detect_revert_state(&root)?;
        if state.in_progress {
            return Ok(state);
        }
        return Err(stderr.trim().to_string());
    }
    detect_revert_state(&root)
}

#[tauri::command]
pub async fn git_revert_detect(root: String) -> Result<RevertStatus, String> {
    detect_revert_state(&root)
}

#[tauri::command]
pub async fn git_revert_continue(root: String) -> Result<RevertStatus, String> {
    let output = cmd("git")
        .args(["revert", "--continue"])
        .current_dir(&root)
        .output()
        .map_err(|e| format!("Git command failed: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let state = detect_revert_state(&root)?;
        if state.in_progress {
            return Ok(state);
        }
        return Err(stderr.trim().to_string());
    }
    detect_revert_state(&root)
}

#[tauri::command]
pub async fn git_revert_abort(root: String) -> Result<RevertStatus, String> {
    let output = cmd("git")
        .args(["revert", "--abort"])
        .current_dir(&root)
        .output()
        .map_err(|e| format!("Git command failed: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(stderr.trim().to_string());
    }
    Ok(RevertStatus {
        in_progress: false,
        current_hash: String::new(),
        has_conflict: false,
    })
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

fn run_git(root: &str, args: &[&str]) -> Result<String, String> {
    let mut c = cmd("git");
    c.args(args);
    c.current_dir(root);
    let output = c
        .output()
        .map_err(|e| format!("Git command failed: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(stderr.trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn run_git_strings(root: &str, args: &[String]) -> Result<String, String> {
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    run_git(root, &refs)
}

fn run_git_lines(root: &str, args: &[&str]) -> Result<Vec<String>, String> {
    let out = run_git(root, args)?;
    Ok(out.lines().map(|l| l.to_string()).filter(|l| !l.is_empty()).collect())
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
pub async fn git_diff(root: String, path: Option<String>, staged: Option<bool>) -> Result<String, String> {
    let mut args = vec!["diff".to_string(), "--no-color".to_string()];
    if staged.unwrap_or(false) { args.push("--cached".to_string()); }
    if let Some(p) = path { args.push(p); }
    run_git_strings(&root, &args)
}

#[tauri::command]
pub async fn git_log(root: String, options: Option<LogOptions>) -> Result<Vec<GitCommit>, String> {
    let mut args = vec![
        "log".to_string(),
        "--format=%H%n%an%n%ae%n%aI%n%B%n%P%n%D%n---%n".to_string(),
        "--no-color".to_string(),
    ];
    if let Some(ref opts) = options {
        if let Some(n) = opts.max_count {
            args.push("-n".to_string());
            args.push(n.to_string());
        }
        if let Some(ref h) = opts.before_hash {
            args.push(format!("{}^1", h));
        }
        if let Some(ref a) = opts.author {
            args.push("--author".to_string());
            args.push(a.clone());
        }
        if let Some(ref s) = opts.since {
            args.push("--since".to_string());
            args.push(s.clone());
        }
        if let Some(ref u) = opts.until {
            args.push("--until".to_string());
            args.push(u.clone());
        }
        if let Some(ref p) = opts.path {
            args.push("--".to_string());
            args.push(p.clone());
        }
    }
    let out = run_git_strings(&root, &args)?;
    let mut commits = Vec::new();
    for entry in out.split("\n---\n") {
        let lines: Vec<&str> = entry.lines().collect();
        if lines.len() < 5 { continue; }
        let hash = lines[0].to_string();
        let author_name = lines[1].to_string();
        let author_email = lines[2].to_string();
        let date = lines[3].to_string();
        let msg_end = if lines.len() >= 6 { lines.len() - 2 } else { lines.len() };
        let message = lines[4..msg_end].join("\n");
        let parents_line = if msg_end < lines.len() { lines[msg_end] } else { "" };
        let refs_line = if msg_end + 1 < lines.len() { lines[msg_end + 1] } else { "" };
        let parents: Vec<String> = if parents_line.is_empty() {
            Vec::new()
        } else {
            parents_line.split_whitespace().map(|s| s.to_string()).collect()
        };
        commits.push(GitCommit { hash, author_name, author_email, date, message, parents, refs: refs_line.to_string() });
    }
    Ok(commits)
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
    run_git_strings(&root, &args)?;
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
pub async fn git_checkout(root: String, target: String) -> Result<(), String> {
    run_git(&root, &["checkout", &target])?;
    Ok(())
}

#[tauri::command]
pub async fn git_add(root: String, paths: Vec<String>) -> Result<(), String> {
    let mut args = vec!["add".to_string()];
    args.extend(paths);
    run_git_strings(&root, &args)?;
    Ok(())
}

#[tauri::command]
pub async fn git_reset(root: String, paths: Vec<String>) -> Result<(), String> {
    let mut args = vec!["reset".to_string()];
    args.extend(paths);
    run_git_strings(&root, &args)?;
    Ok(())
}

#[tauri::command]
pub async fn git_commit(root: String, message: String, amend: Option<bool>) -> Result<String, String> {
    if amend.unwrap_or(false) {
        run_git(&root, &["commit", "--amend", "-m", &message])?;
    } else {
        run_git(&root, &["commit", "-m", &message])?;
    }
    let hash = run_git(&root, &["rev-parse", "HEAD"])?;
    Ok(hash.trim().to_string())
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct PushOptions { pub force_with_lease: Option<bool>, pub tags: Option<bool>, pub upstream: Option<bool> }

#[tauri::command]
pub async fn git_push(root: String, remote: Option<String>, branch: Option<String>, options: Option<PushOptions>, token: Option<String>) -> Result<(), String> {
    let mut args = vec!["push".to_string()];
    let opts = options.unwrap_or_default();
    if opts.force_with_lease.unwrap_or(false) { args.push("--force-with-lease".to_string()); }
    if opts.tags.unwrap_or(false) { args.push("--tags".to_string()); }
    if let Some(r) = remote { args.push(r); }
    if let Some(b) = branch { args.push(b); }
    if opts.upstream.unwrap_or(false) { args.push("--set-upstream".to_string()); }
    // Token is passed securely via environment variable through GIT_CONFIG_PARAMETERS
    // instead of command-line args which are visible to other processes
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let output = if let Some(ref t) = token {
        let env_val = format!("http.extraHeader=Authorization: bearer {}", t);
        cmd("git")
            .args(&refs)
            .current_dir(&root)
            .env("GIT_CONFIG_PARAMETERS", format!("'{}'", env_val))
            .output()
            .map_err(|e| format!("Git command failed: {}", e))?
    } else {
        cmd("git")
            .args(&refs)
            .current_dir(&root)
            .output()
            .map_err(|e| format!("Git command failed: {}", e))?
    };
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(stderr.trim().to_string());
    }
    Ok(())
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct PullOptions { pub rebase: Option<bool>, pub ff_only: Option<bool> }

#[tauri::command]
pub async fn git_pull(root: String, remote: Option<String>, branch: Option<String>, options: Option<PullOptions>, token: Option<String>) -> Result<(), String> {
    let mut args = vec!["pull".to_string()];
    let opts = options.unwrap_or_default();
    if opts.rebase.unwrap_or(false) { args.push("--rebase".to_string()); }
    if opts.ff_only.unwrap_or(false) { args.push("--ff-only".to_string()); }
    if let Some(r) = remote { args.push(r); }
    if let Some(b) = branch { args.push(b); }
    // Token is passed securely via environment variable through GIT_CONFIG_PARAMETERS
    // instead of command-line args which are visible to other processes
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let output = if let Some(ref t) = token {
        let env_val = format!("http.extraHeader=Authorization: bearer {}", t);
        cmd("git")
            .args(&refs)
            .current_dir(&root)
            .env("GIT_CONFIG_PARAMETERS", format!("'{}'", env_val))
            .output()
            .map_err(|e| format!("Git command failed: {}", e))?
    } else {
        cmd("git")
            .args(&refs)
            .current_dir(&root)
            .output()
            .map_err(|e| format!("Git command failed: {}", e))?
    };
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(stderr.trim().to_string());
    }
    Ok(())
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct FetchOptions { pub prune: Option<bool>, pub tags: Option<bool> }

#[tauri::command]
pub async fn git_fetch(root: String, remote: Option<String>, options: Option<FetchOptions>, token: Option<String>) -> Result<(), String> {
    let mut args = vec!["fetch".to_string()];
    let opts = options.unwrap_or_default();
    if opts.prune.unwrap_or(false) { args.push("--prune".to_string()); }
    if opts.tags.unwrap_or(false) { args.push("--tags".to_string()); }
    if let Some(r) = remote { args.push(r); }
    // Token is passed securely via environment variable through GIT_CONFIG_PARAMETERS
    // instead of command-line args which are visible to other processes
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let output = if let Some(ref t) = token {
        let env_val = format!("http.extraHeader=Authorization: bearer {}", t);
        cmd("git")
            .args(&refs)
            .current_dir(&root)
            .env("GIT_CONFIG_PARAMETERS", format!("'{}'", env_val))
            .output()
            .map_err(|e| format!("Git command failed: {}", e))?
    } else {
        cmd("git")
            .args(&refs)
            .current_dir(&root)
            .output()
            .map_err(|e| format!("Git command failed: {}", e))?
    };
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(stderr.trim().to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn git_remote_list(root: String) -> Result<Vec<GitRemote>, String> {
    let names = run_git_lines(&root, &["remote"])?;
    let mut remotes = Vec::new();
    for name in &names {
        let fetch_url = run_git(&root, &["remote", "get-url", name]).ok().map(|s| s.trim().to_string());
        let push_url = run_git(&root, &["remote", "get-url", "--push", name]).ok().map(|s| s.trim().to_string());
        remotes.push(GitRemote { name: name.clone(), fetch_url, push_url });
    }
    Ok(remotes)
}

#[tauri::command]
pub async fn git_remote_add(root: String, name: String, url: String) -> Result<(), String> {
    run_git(&root, &["remote", "add", &name, &url])?;
    Ok(())
}

#[tauri::command]
pub async fn git_remote_remove(root: String, name: String) -> Result<(), String> {
    run_git(&root, &["remote", "remove", &name])?;
    Ok(())
}

#[tauri::command]
pub async fn git_stash_list(root: String) -> Result<Vec<GitStash>, String> {
    let lines = run_git_lines(&root, &["stash", "list", "--format=%gd%n%gs%n%H"]).unwrap_or_default();
    let mut stashes = Vec::new();
    let mut i = 0;
    while i + 2 < lines.len() {
        let ref_str = &lines[i];
        let message = lines[i + 1].clone();
        let hash = lines[i + 2].clone();
        let idx = ref_str.trim_start_matches("stash@{").trim_end_matches('}').parse().unwrap_or(0);
        let branch = message.split(':').next().unwrap_or("").trim().to_string();
        stashes.push(GitStash { index: idx, message, branch, hash });
        i += 3;
    }
    Ok(stashes)
}

#[tauri::command]
pub async fn git_stash_push(root: String, message: Option<String>) -> Result<(), String> {
    if let Some(msg) = message {
        run_git(&root, &["stash", "push", "-m", &msg])?;
    } else {
        run_git(&root, &["stash", "push"])?;
    }
    Ok(())
}

#[tauri::command]
pub async fn git_stash_pop(root: String, index: Option<usize>) -> Result<(), String> {
    if let Some(idx) = index {
        run_git(&root, &["stash", "pop", &format!("stash@{{{}}}", idx)])?;
    } else {
        run_git(&root, &["stash", "pop"])?;
    }
    Ok(())
}

#[tauri::command]
pub async fn git_stash_drop(root: String, index: Option<usize>) -> Result<(), String> {
    if let Some(idx) = index {
        run_git(&root, &["stash", "drop", &format!("stash@{{{}}}", idx)])?;
    } else {
        run_git(&root, &["stash", "drop"])?;
    }
    Ok(())
}

#[tauri::command]
pub async fn git_blame(root: String, path: String) -> Result<Vec<GitBlameLine>, String> {
    let lines = run_git_lines(&root, &["blame", "--porcelain", &path])?;
    let mut blame = Vec::new();
    let mut i = 0;
    while i < lines.len() {
        if lines[i].starts_with('\t') { i += 1; continue; }
        let parts: Vec<&str> = lines[i].splitn(4, ' ').collect();
        if parts.len() < 4 { i += 1; continue; }
        let hash = parts[0].to_string();
        let lineno: usize = parts[2].parse().unwrap_or(0);
        let mut entry = GitBlameLine {
            line: lineno, hash: hash.clone(),
            author: String::new(), author_email: String::new(),
            date: String::new(), message: String::new(),
        };
        i += 1;
        while i < lines.len() && !lines[i].starts_with('\t') {
            let meta = &lines[i];
            if let Some(val) = meta.strip_prefix("author ") { entry.author = val.to_string(); }
            else if let Some(val) = meta.strip_prefix("author-mail ") { entry.author_email = val.trim_matches('<').trim_matches('>').to_string(); }
            else if let Some(val) = meta.strip_prefix("author-time ") {
                if let Ok(ts) = val.parse::<i64>() {
                    entry.date = unix_to_rfc3339(ts);
                }
            }
            i += 1;
        }
        if i < lines.len() { entry.message = lines[i].trim_start_matches('\t').to_string(); i += 1; }
        blame.push(entry);
    }
    Ok(blame)
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
pub async fn git_config_get(root: String, key: String) -> Result<String, String> {
    run_git(&root, &["config", "--local", &key])
        .or_else(|_| run_git(&root, &["config", "--global", &key]))
        .map(|s| s.trim().to_string())
}

#[tauri::command]
pub async fn git_config_set(root: String, key: String, value: String, scope: Option<String>) -> Result<(), String> {
    let scope_flag = match scope.as_deref() {
        Some("global") => "--global",
        Some("system") => "--system",
        _ => "--local",
    };
    run_git(&root, &["config", scope_flag, &key, &value])?;
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

#[tauri::command]
pub async fn git_merge_base(root: String, commit1: String, commit2: String) -> Result<String, String> {
    run_git(&root, &["merge-base", &commit1, &commit2]).map(|s| s.trim().to_string())
}

fn parse_diff_hunks(diff_output: &str, file_path: &str) -> Vec<DiffHunk> {
    let mut hunks: Vec<DiffHunk> = Vec::new();
    let lines: Vec<&str> = diff_output.lines().collect();
    let mut i = 0;

    while i < lines.len() {
        let line = lines[i];
        if line.starts_with("@@") {
            let header = line.trim_start_matches("@@").trim_end_matches("@@").trim();
            let parts: Vec<&str> = header.split("@@").next().unwrap_or("").trim().split_whitespace().collect();
            let mut old_start = 0usize;
            let mut old_lines = 0usize;
            let mut new_start = 0usize;
            let mut new_lines = 0usize;

            if let Some(old_part) = parts.first() {
                let trimmed = old_part.trim_start_matches('-');
                let parts2: Vec<&str> = trimmed.split(',').collect();
                old_start = parts2.first().and_then(|s| s.parse().ok()).unwrap_or(0);
                old_lines = parts2.get(1).and_then(|s| s.parse().ok()).unwrap_or(1);
            }
            if let Some(new_part) = parts.get(1) {
                let trimmed = new_part.trim_start_matches('+');
                let parts2: Vec<&str> = trimmed.split(',').collect();
                new_start = parts2.first().and_then(|s| s.parse().ok()).unwrap_or(0);
                new_lines = parts2.get(1).and_then(|s| s.parse().ok()).unwrap_or(1);
            }

            let section_header = if let Some(idx) = header.find("@@") {
                let after = &header[idx + 2..];
                let section = after.trim().trim_start_matches("@@").trim();
                if section.starts_with("@@") {
                    section[2..].trim().to_string()
                } else {
                    section.to_string()
                }
            } else {
                String::new()
            };

            i += 1;
            let mut hunk_lines: Vec<DiffLine> = Vec::new();
            let mut old_line_num = old_start;
            let mut new_line_num = new_start;

            while i < lines.len() && !lines[i].starts_with("@@") && !lines[i].starts_with("diff --git") {
                let content = lines[i];
                if content.starts_with('-') {
                    hunk_lines.push(DiffLine {
                        content: content[1..].to_string(),
                        old_line_number: Some(old_line_num),
                        new_line_number: None,
                        line_type: "removed".to_string(),
                    });
                    old_line_num += 1;
                } else if content.starts_with('+') {
                    hunk_lines.push(DiffLine {
                        content: content[1..].to_string(),
                        old_line_number: None,
                        new_line_number: Some(new_line_num),
                        line_type: "added".to_string(),
                    });
                    new_line_num += 1;
                } else if content.starts_with(' ') || content.is_empty() {
                    let actual = if content.is_empty() { "" } else { &content[1..] };
                    hunk_lines.push(DiffLine {
                        content: actual.to_string(),
                        old_line_number: Some(old_line_num),
                        new_line_number: Some(new_line_num),
                        line_type: "context".to_string(),
                    });
                    old_line_num += 1;
                    new_line_num += 1;
                }
                i += 1;
            }

            hunks.push(DiffHunk {
                index: hunks.len(),
                old_start,
                old_lines,
                new_start,
                new_lines,
                section_header,
                lines: hunk_lines,
                file_path: file_path.to_string(),
            });
        } else {
            i += 1;
        }
    }
    hunks
}

#[tauri::command]
pub async fn git_diff_hunks(root: String, path: Option<String>, staged: Option<bool>) -> Result<Vec<DiffHunk>, String> {
    let mut args = vec![
        "diff".to_string(),
        "--no-color".to_string(),
        "--unified=3".to_string(),
        "--inter-hunk-context=0".to_string(),
    ];
    if staged.unwrap_or(false) {
        args.push("--cached".to_string());
    }
    if let Some(ref p) = path {
        args.push(p.clone());
    }
    let out = run_git_strings(&root, &args)?;
    let file_path = path.clone().unwrap_or_default();
    Ok(parse_diff_hunks(&out, &file_path))
}

fn apply_patch(root: &str, patch_content: &str, reverse: bool) -> Result<(), String> {
    let temp_dir = std::env::temp_dir();
    let patch_name = format!("code-editor-patch-{}.patch", std::process::id());
    let patch_path = temp_dir.join(&patch_name);

    let mut file = std::fs::File::create(&patch_path).map_err(|e| format!("Failed to create temp patch: {}", e))?;
    file.write_all(patch_content.as_bytes()).map_err(|e| format!("Failed to write temp patch: {}", e))?;
    drop(file);

    let mut args = vec!["apply", "--cached", "--unidiff-zero", "--ignore-whitespace"];
    if reverse {
        args.push("--reverse");
    }
    let patch_str = patch_path.to_string_lossy().to_string();
    args.push(&patch_str);

    let result = run_git(root, &args);
    let _ = std::fs::remove_file(&patch_path);
    result.map(|_| ())
}

fn build_hunk_patch(file_path: &str, hunk: &DiffHunk) -> String {
    let mut patch = String::new();
    patch.push_str(&format!("--- a/{}\n", file_path));
    patch.push_str(&format!("+++ b/{}\n", file_path));
    let old_count = hunk.old_lines.max(1);
    let new_count = hunk.new_lines.max(1);
    patch.push_str(&format!("@@ -{},{} +{},{} @@ {}\n",
        hunk.old_start, old_count, hunk.new_start, new_count, hunk.section_header));
    for line in &hunk.lines {
        match line.line_type.as_str() {
            "added" => patch.push_str(&format!("+{}\n", line.content)),
            "removed" => patch.push_str(&format!("-{}\n", line.content)),
            _ => patch.push_str(&format!(" {}\n", line.content)),
        }
    }
    patch
}

#[tauri::command]
pub async fn git_stage_hunk(root: String, file_path: String, hunk_index: usize) -> Result<(), String> {
    let out = run_git(&root, &["diff", "--no-color", "--unified=3", "--inter-hunk-context=0", &file_path])?;
    let hunks = parse_diff_hunks(&out, &file_path);
    let hunk = hunks.into_iter().find(|h| h.index == hunk_index)
        .ok_or_else(|| format!("Hunk {} not found in {}", hunk_index, file_path))?;
    let patch = build_hunk_patch(&file_path, &hunk);
    apply_patch(&root, &patch, false)
}

#[tauri::command]
pub async fn git_unstage_hunk(root: String, file_path: String, hunk_index: usize) -> Result<(), String> {
    let out = run_git(&root, &["diff", "--cached", "--no-color", "--unified=3", "--inter-hunk-context=0", &file_path])?;
    let hunks = parse_diff_hunks(&out, &file_path);
    let hunk = hunks.into_iter().find(|h| h.index == hunk_index)
        .ok_or_else(|| format!("Staged hunk {} not found in {}", hunk_index, file_path))?;
    let patch = build_hunk_patch(&file_path, &hunk);
    apply_patch(&root, &patch, true)
}

#[tauri::command]
pub async fn git_stage_lines(root: String, file_path: String, selections: Vec<LineSelection>) -> Result<(), String> {
    let out = run_git(&root, &["diff", "--no-color", "--unified=3", "--inter-hunk-context=0", &file_path])?;
    let hunks = parse_diff_hunks(&out, &file_path);

    let mut patch = String::new();
    patch.push_str(&format!("--- a/{}\n", file_path));
    patch.push_str(&format!("+++ b/{}\n", file_path));

    for sel in &selections {
        if let Some(hunk) = hunks.iter().find(|h| h.index == sel.hunk_index) {
            let sel_set: std::collections::HashSet<&usize> = sel.line_indices.iter().collect();
            let mut selected_lines: Vec<&DiffLine> = Vec::new();
            let mut has_any = false;

            for (idx, line) in hunk.lines.iter().enumerate() {
                if sel_set.contains(&idx) {
                    selected_lines.push(line);
                    has_any = true;
                } else if line.line_type == "context" {
                    selected_lines.push(line);
                }
            }

            if !has_any { continue; }

            let first = selected_lines.first().map(|l| match l.line_type.as_str() {
                "removed" => l.old_line_number.unwrap_or(1),
                "added" => l.new_line_number.unwrap_or(1),
                _ => l.old_line_number.unwrap_or(1),
            }).unwrap_or(1);
            let last = selected_lines.last().map(|l| match l.line_type.as_str() {
                "removed" => l.old_line_number.unwrap_or(1),
                "added" => l.new_line_number.unwrap_or(1),
                _ => l.new_line_number.unwrap_or(l.old_line_number.unwrap_or(1)),
            }).unwrap_or(1);

            let old_count = last.saturating_sub(first) + 1;
            let new_count = old_count;

            patch.push_str(&format!("@@ -{},{} +{},{} @@\n", first, old_count, first, new_count));

            for line in &selected_lines {
                match line.line_type.as_str() {
                    "added" => patch.push_str(&format!("+{}\n", line.content)),
                    "removed" => patch.push_str(&format!("-{}\n", line.content)),
                    _ => patch.push_str(&format!(" {}\n", line.content)),
                }
            }
        }
    }

    apply_patch(&root, &patch, false)
}

// ── Phase 3: Interactive Rebase ──

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RebaseTodo {
    pub index: usize,
    pub original_index: usize,
    pub action: String,
    pub hash: String,
    pub message: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RebaseStatus {
    pub in_progress: bool,
    pub total: usize,
    pub current: usize,
    pub current_hash: String,
    pub current_message: String,
    pub pause_reason: String,
    pub has_conflict: bool,
}

fn detect_rebase_state(root: &str) -> Result<RebaseStatus, String> {
    let git_dir = run_git(root, &["rev-parse", "--git-dir"])?.trim().to_string();
    let rebase_dir = std::path::Path::new(&git_dir).join("rebase-merge");
    if !rebase_dir.exists() {
        return Ok(RebaseStatus {
            in_progress: false,
            total: 0,
            current: 0,
            current_hash: String::new(),
            current_message: String::new(),
            pause_reason: "none".to_string(),
            has_conflict: false,
        });
    }
    let read_num = |name: &str| -> usize {
        std::fs::read_to_string(rebase_dir.join(name))
            .ok().and_then(|s| s.trim().parse().ok()).unwrap_or(0)
    };
    let msgnum = read_num("msgnum");
    let end = read_num("end");
    let has_conflict = rebase_dir.join("REBASE_HEAD").exists();
    let current_hash = std::fs::read_to_string(rebase_dir.join("stopped-sha"))
        .ok().map(|s| s.trim().to_string()).unwrap_or_default();
    let current_message = std::fs::read_to_string(rebase_dir.join("message"))
        .ok().map(|s| {
            let trimmed = s.trim();
            if trimmed.len() > 80 { format!("{}...", &trimmed[..80]) } else { trimmed.to_string() }
        }).unwrap_or_default();
    let pause_reason = if has_conflict {
        "conflict".to_string()
    } else if msgnum <= end {
        let todo_path = rebase_dir.join("git-rebase-todo");
        if let Ok(content) = std::fs::read_to_string(&todo_path) {
            let first = content.lines().next().unwrap_or("");
            let action = first.split_whitespace().next().unwrap_or("").trim();
            match action {
                "reword" => "reword",
                "edit" => "edit",
                _ => "todoEdit",
            }.to_string()
        } else {
            "none".to_string()
        }
    } else {
        "none".to_string()
    };
    Ok(RebaseStatus {
        in_progress: true,
        total: end,
        current: msgnum,
        current_hash,
        current_message,
        pause_reason,
        has_conflict,
    })
}

fn write_editor_script(content: &str, editor_file_name: &str) -> Result<String, String> {
    let temp_dir = std::env::temp_dir();
    let pid = std::process::id();
    let content_path = temp_dir.join(format!("code-editor-{}-{}.txt", editor_file_name, pid));
    std::fs::write(&content_path, content)
        .map_err(|e| format!("Failed to write temp content: {}", e))?;

    let is_windows = cfg!(target_os = "windows");
    let (script_path, script_content): (std::path::PathBuf, String) = if is_windows {
        let script_path = temp_dir.join(format!("code-editor-{}-{}.bat", editor_file_name, pid));
        let script = format!(
            "@copy /y \"{}\" \"%1\" >nul 2>&1",
            content_path.to_string_lossy()
        );
        (script_path, script)
    } else {
        let script_path = temp_dir.join(format!("code-editor-{}-{}.sh", editor_file_name, pid));
        let script = format!(
            "#!/bin/sh\ncp \"{}\" \"$1\"\n",
            content_path.to_string_lossy()
        );
        (script_path, script)
    };
    std::fs::write(&script_path, script_content)
        .map_err(|e| format!("Failed to write editor script: {}", e))?;
    #[cfg(not(target_os = "windows"))]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&script_path, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("Failed to set script executable: {}", e))?;
    }
    Ok(script_path.to_string_lossy().to_string())
}

fn clean_editor_files(editor_file_name: &str) {
    let temp_dir = std::env::temp_dir();
    let pid = std::process::id();
    let _ = std::fs::remove_file(temp_dir.join(format!("code-editor-{}-{}.txt", editor_file_name, pid)));
    let _ = std::fs::remove_file(temp_dir.join(format!("code-editor-{}-{}.bat", editor_file_name, pid)));
    let _ = std::fs::remove_file(temp_dir.join(format!("code-editor-{}-{}.sh", editor_file_name, pid)));
}

#[tauri::command]
pub async fn git_rebase_detect(root: String) -> Result<RebaseStatus, String> {
    detect_rebase_state(&root)
}

#[tauri::command]
pub async fn git_rebase_todo_list(root: String, target: Option<String>) -> Result<Vec<RebaseTodo>, String> {
    let git_dir = run_git(&root, &["rev-parse", "--git-dir"])?.trim().to_string();
    let rebase_dir = std::path::Path::new(&git_dir).join("rebase-merge");
    if rebase_dir.exists() && target.is_none() {
        let todo_path = rebase_dir.join("git-rebase-todo");
        let done_path = rebase_dir.join("done");
        let todo_content = std::fs::read_to_string(&todo_path).unwrap_or_default();
        let done_content = std::fs::read_to_string(&done_path).unwrap_or_default();
        let done_count = done_content.lines().filter(|l| !l.trim().is_empty()).count();
        let mut todos = Vec::new();
        for (i, line) in todo_content.lines().enumerate() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') { continue; }
            let parts: Vec<&str> = line.splitn(2, ' ').collect();
            if parts.len() < 2 { continue; }
            let action = parts[0].to_string();
            let rest = parts[1].to_string();
            let hash_end = rest.find(' ').unwrap_or(rest.len());
            let hash = rest[..hash_end].to_string();
            let message = if hash_end < rest.len() { rest[hash_end+1..].to_string() } else { String::new() };
            todos.push(RebaseTodo {
                index: done_count + i,
                original_index: done_count + i,
                action,
                hash,
                message,
            });
        }
        return Ok(todos);
    }
    if let Some(t) = target {
        let target = t.trim();
        if target.is_empty() {
            return Err("Target branch or commit is required".to_string());
        }
        let out = run_git(&root, &["log", "--reverse", &format!("{}..HEAD", target), "--format=%H|%s", "--no-color"])?;
        let mut todos = Vec::new();
        for (i, line) in out.lines().enumerate() {
            let line = line.trim();
            if line.is_empty() { continue; }
            let parts: Vec<&str> = line.splitn(2, '|').collect();
            if parts.len() < 2 { continue; }
            todos.push(RebaseTodo {
                index: i,
                original_index: i,
                action: "pick".to_string(),
                hash: parts[0].to_string(),
                message: parts[1].to_string(),
            });
        }
        return Ok(todos);
    }
    Ok(Vec::new())
}

#[tauri::command]
pub async fn git_rebase_start(root: String, target: String, todos: Vec<RebaseTodo>) -> Result<RebaseStatus, String> {
    let status = run_git(&root, &["status", "--porcelain"])?;
    if !status.trim().is_empty() {
        return Err("Uncommitted changes — commit or stash before rebasing".to_string());
    }
    let todo_content: String = todos.iter().map(|t| {
        let msg = t.message.replace('\n', " ");
        format!("{} {} {}\n", t.action, t.hash, msg)
    }).collect();
    let script_path = write_editor_script(&todo_content, "rebase-sequence")?;
    {
        let output = cmd("git")
            .args(["rebase", "-i", &target])
            .current_dir(&root)
            .env("GIT_SEQUENCE_EDITOR", &script_path)
            .output()
            .map_err(|e| format!("Failed to start rebase: {}", e))?;
        if !output.status.success() {
            clean_editor_files("rebase-sequence");
            let state = detect_rebase_state(&root)?;
            if state.in_progress {
                return Ok(state);
            }
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            return Err(stderr.trim().to_string());
        }
    }
    clean_editor_files("rebase-sequence");
    let state = detect_rebase_state(&root)?;
    Ok(state)
}

#[tauri::command]
pub async fn git_rebase_edit_todo(root: String, todos: Vec<RebaseTodo>) -> Result<RebaseStatus, String> {
    let git_dir = run_git(&root, &["rev-parse", "--git-dir"])?.trim().to_string();
    let todo_path = std::path::Path::new(&git_dir).join("rebase-merge").join("git-rebase-todo");
    if !todo_path.exists() {
        return Err("No rebase in progress".to_string());
    }
    let content: String = todos.iter().map(|t| {
        let msg = t.message.replace('\n', " ");
        format!("{} {} {}\n", t.action, t.hash, msg)
    }).collect();
    let backup_path = std::path::PathBuf::from(format!("{}.backup", todo_path.display()));
    let _ = std::fs::copy(&todo_path, &backup_path);
    std::fs::write(&todo_path, &content)
        .map_err(|e| format!("Failed to write todo: {}", e))?;
    detect_rebase_state(&root)
}

#[tauri::command]
pub async fn git_rebase_continue(root: String, message: Option<String>) -> Result<RebaseStatus, String> {
    let output = if let Some(msg) = message {
        let script_path = write_editor_script(&msg, "rebase-message")?;
        let out = cmd("git")
            .args(["rebase", "--continue"])
            .current_dir(&root)
            .env("GIT_EDITOR", &script_path)
            .output()
            .map_err(|e| format!("Failed to continue rebase: {}", e))?;
        clean_editor_files("rebase-message");
        out
    } else {
        cmd("git")
            .args(["rebase", "--continue"])
            .current_dir(&root)
            .output()
            .map_err(|e| format!("Failed to continue rebase: {}", e))?
    };
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let state = detect_rebase_state(&root)?;
        if state.in_progress {
            return Ok(state);
        }
        return Err(stderr.trim().to_string());
    }
    detect_rebase_state(&root)
}

#[tauri::command]
pub async fn git_rebase_skip(root: String) -> Result<RebaseStatus, String> {
    let output = cmd("git")
        .args(["rebase", "--skip"])
        .current_dir(&root)
        .output()
        .map_err(|e| format!("Failed to skip: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let state = detect_rebase_state(&root)?;
        if state.in_progress {
            return Ok(state);
        }
        return Err(stderr.trim().to_string());
    }
    detect_rebase_state(&root)
}

#[tauri::command]
pub async fn git_rebase_abort(root: String, force: Option<bool>) -> Result<RebaseStatus, String> {
    if force.unwrap_or(false) {
        run_git(&root, &["rebase", "--quit"])?;
    } else {
        let result = run_git(&root, &["rebase", "--abort"]);
        if result.is_err() {
            run_git(&root, &["rebase", "--quit"])?;
        }
    };
    detect_rebase_state(&root)
}

fn parse_graph_refs(refs_str: &str, hash: &str) -> Vec<GraphRef> {
    fn classify(name: &str) -> String {
        if name.starts_with("origin/") {
            "remote".to_string()
        } else {
            "branch".to_string()
        }
    }
    let mut refs = Vec::new();
    for part in refs_str.split(", ") {
        let part = part.trim();
        if part.is_empty() { continue; }
        if let Some(rest) = part.strip_prefix("tag: ") {
            refs.push(GraphRef { hash: hash.to_string(), name: rest.to_string(), ref_type: "tag".to_string() });
        } else if let Some(rest) = part.strip_prefix("HEAD -> ") {
            let extras: Vec<&str> = rest.split(", ").collect();
            refs.push(GraphRef { hash: hash.to_string(), name: "HEAD".to_string(), ref_type: "head".to_string() });
            for (i, item) in extras.iter().enumerate() {
                let item = item.trim();
                if item.is_empty() { continue; }
                if i == 0 {
                    refs.push(GraphRef { hash: hash.to_string(), name: item.to_string(), ref_type: "branch".to_string() });
                } else if let Some(tag) = item.strip_prefix("tag: ") {
                    refs.push(GraphRef { hash: hash.to_string(), name: tag.to_string(), ref_type: "tag".to_string() });
                } else {
                    refs.push(GraphRef { hash: hash.to_string(), name: item.to_string(), ref_type: classify(item) });
                }
            }
        } else if part == "HEAD" {
            refs.push(GraphRef { hash: hash.to_string(), name: "HEAD".to_string(), ref_type: "head".to_string() });
        } else {
            refs.push(GraphRef { hash: hash.to_string(), name: part.to_string(), ref_type: classify(part) });
        }
    }
    refs
}

#[tauri::command]
pub async fn git_log_graph(root: String, max_count: Option<u32>) -> Result<GraphData, String> {
    let args = vec![
        "log".to_string(),
        "--all".to_string(),
        format!("--max-count={}", max_count.unwrap_or(500)),
        "--format=%H|%P|%s|%an|%aI|%D".to_string(),
        "--no-color".to_string(),
    ];
    let out = run_git_strings(&root, &args)?;
    let mut nodes = Vec::new();
    let mut refs = Vec::new();
    let mut hash_index: std::collections::HashMap<String, usize> = std::collections::HashMap::new();

    for line in out.lines() {
        let line = line.trim();
        if line.is_empty() { continue; }
        let parts: Vec<&str> = line.splitn(6, '|').collect();
        if parts.len() < 4 { continue; }
        let hash = parts[0].to_string();
        let parents_str = parts.get(1).map(|s| s.trim()).unwrap_or("");
        let parents: Vec<String> = if parents_str.is_empty() {
            Vec::new()
        } else {
            parents_str.split_whitespace().map(|s| s.to_string()).collect()
        };
        let message = parts.get(2).unwrap_or(&"").to_string();
        let author = parts.get(3).unwrap_or(&"").to_string();
        let date = parts.get(4).unwrap_or(&"").to_string();
        let refs_str = parts.get(5).unwrap_or(&"");

        if !refs_str.is_empty() {
            refs.extend(parse_graph_refs(refs_str, &hash));
        }

        hash_index.insert(hash.clone(), nodes.len());
        nodes.push(GraphNode {
            hash,
            parents,
            message,
            author,
            date,
            children: Vec::new(),
        });
    }

    let child_assignments: Vec<(usize, String)> = {
        let mut assignments = Vec::new();
        for (i, node) in nodes.iter().enumerate() {
            for p in &node.parents {
                if let Some(&parent_idx) = hash_index.get(p) {
                    assignments.push((parent_idx, nodes[i].hash.clone()));
                }
            }
        }
        assignments
    };
    for (parent_idx, child_hash) in child_assignments {
        nodes[parent_idx].children.push(child_hash);
    }

    Ok(GraphData { nodes, refs })
}

#[tauri::command]
pub async fn git_commit_detail(root: String, hash: String) -> Result<CommitDetail, String> {
    let out = run_git(&root, &["show", "--format=%H%n%an%n%ae%n%aI%n%cN%n%B%n---STAT---", "--numstat", &hash])?;
    let lines: Vec<&str> = out.lines().collect();
    let mut idx = 0;
    let commit_hash = lines.get(idx).unwrap_or(&"").to_string(); idx += 1;
    let author_name = lines.get(idx).unwrap_or(&"").to_string(); idx += 1;
    let author_email = lines.get(idx).unwrap_or(&"").to_string(); idx += 1;
    let date = lines.get(idx).unwrap_or(&"").to_string(); idx += 1;
    let committer = lines.get(idx).unwrap_or(&"").to_string(); idx += 1;
    let mut message = String::new();
    while idx < lines.len() && lines[idx] != "---STAT---" {
        if !message.is_empty() { message.push('\n'); }
        message.push_str(lines[idx]);
        idx += 1;
    }
    if idx < lines.len() { idx += 1; }

    while idx < lines.len() && lines[idx].trim().is_empty() { idx += 1; }

    let mut stats = Vec::new();
    while idx < lines.len() {
        let line = lines[idx].trim();
        if line.is_empty() || line.starts_with("diff --git") {
            break;
        }
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() >= 3 {
            if let (Ok(added), Ok(deleted)) = (parts[0].parse::<usize>(), parts[1].parse::<usize>()) {
                stats.push(FileStat {
                    path: parts[2..].join("\t"),
                    added,
                    deleted,
                });
            }
        }
        idx += 1;
    }

    while idx < lines.len() && lines[idx].trim().is_empty() { idx += 1; }

    let diff = lines[idx..].join("\n");

    Ok(CommitDetail {
        hash: commit_hash,
        message,
        author_name,
        author_email,
        date,
        committer,
        stats,
        diff,
    })
}

#[tauri::command]
pub async fn git_stash_show(root: String, index: usize) -> Result<Vec<DiffHunk>, String> {
    let out = run_git(
        &root,
        &[
            "stash",
            "show",
            "-p",
            &format!("stash@{{{}}}", index),
        ],
    )?;
    Ok(parse_diff_hunks(&out, &format!("stash@{{{}}}", index)))
}

#[tauri::command]
pub async fn git_stash_apply(root: String, index: usize, restore_index: Option<bool>) -> Result<StashApplyResult, String> {
    let mut args = vec!["stash", "apply"];
    if restore_index.unwrap_or(false) {
        args.push("--index");
    }
    let stash_ref = format!("stash@{{{}}}", index);
    args.push(&stash_ref);
    match run_git(&root, &args) {
        Ok(_) => {
            let conflicted = run_git_lines(&root, &["diff", "--name-only", "--diff-filter=U"]).unwrap_or_default();
            Ok(StashApplyResult {
                success: conflicted.is_empty(),
                has_conflict: !conflicted.is_empty(),
                conflicted_files: conflicted,
            })
        }
        Err(e) => {
            if e.contains("CONFLICT") || e.contains("Merge conflict") {
                let conflicted = run_git_lines(&root, &["diff", "--name-only", "--diff-filter=U"]).unwrap_or_default();
                Ok(StashApplyResult {
                    success: false,
                    has_conflict: true,
                    conflicted_files: conflicted,
                })
            } else {
                Err(e)
            }
        }
    }
}

#[tauri::command]
pub async fn git_stash_partial(root: String, paths: Vec<String>, message: Option<String>, keep_index: Option<bool>, staged: Option<bool>) -> Result<(), String> {
    let mut args = vec!["stash", "push"];
    if let Some(ref msg) = message {
        args.push("-m");
        args.push(msg);
    }
    if keep_index.unwrap_or(false) {
        args.push("--keep-index");
    }
    if staged.unwrap_or(false) {
        args.push("--staged");
    }
    args.push("--");
    for p in &paths {
        args.push(p);
    }
    run_git(&root, &args)?;
    Ok(())
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

fn parse_bisect_log(log: &str) -> (String, String, usize, usize, Option<String>, Option<String>) {
    let lines: Vec<&str> = log.lines().collect();
    let mut current_hash = String::new();
    let mut current_message = String::new();
    let mut first_bad_hash = None;
    let mut first_bad_message = None;
    let mut remaining = 0usize;
    let total = lines.len().saturating_sub(1);
    for line in &lines {
        let trimmed = line.trim();
        if trimmed.starts_with("# first bad commit:") {
            let rest = trimmed.trim_start_matches("# first bad commit:[").trim_end_matches(']');
            let parts: Vec<&str> = rest.splitn(2, ' ').collect();
            if !parts.is_empty() {
                first_bad_hash = Some(parts[0].to_string());
                first_bad_message = parts.get(1).map(|s| s.to_string());
            }
        } else if trimmed.starts_with('#') {
            continue;
        } else if !trimmed.is_empty() {
            if current_hash.is_empty() {
                let parts: Vec<&str> = trimmed.splitn(2, ' ').collect();
                if parts.len() >= 2 {
                    current_hash = parts[0].to_string();
                    current_message = parts[1].to_string();
                }
            }
            remaining += 1;
        }
    }
    (current_hash, current_message, remaining, total, first_bad_hash, first_bad_message)
}

#[tauri::command]
pub async fn git_bisect_start(root: String, options: BisectStartOptions) -> Result<BisectStatus, String> {
    let status_out = run_git(&root, &["status", "--porcelain"])?;
    if !status_out.trim().is_empty() {
        return Err("Uncommitted changes — commit or stash before bisecting".to_string());
    }
    if run_git(&root, &["merge-base", "--is-ancestor", &options.good, &options.bad]).is_err() {
        return Err(format!("'{}' is not an ancestor of '{}' — bisect range invalid", options.good, options.bad));
    }
    let mut args = vec!["bisect", "start", &options.bad, &options.good];
    if let Some(ref paths) = options.paths {
        args.push("--");
        for p in paths {
            args.push(p);
        }
    }
    run_git(&root, &args)?;
    let log = run_git(&root, &["bisect", "log"])?;
    let (current_hash, current_message, remaining, total, first_bad_hash, first_bad_message) = parse_bisect_log(&log);
    Ok(BisectStatus {
        in_progress: true,
        step: "running".to_string(),
        current_hash,
        current_message,
        remaining,
        total,
        first_bad_hash,
        first_bad_message,
        log,
    })
}

#[tauri::command]
pub async fn git_bisect_state(root: String, state: String, hash: Option<String>) -> Result<BisectStatus, String> {
    let valid_states = ["good", "bad", "skip"];
    if !valid_states.contains(&state.as_str()) {
        return Err(format!("Invalid bisect state: {}. Use good, bad, or skip.", state));
    }
    let mut args = vec!["bisect", &state];
    if let Some(ref h) = hash {
        args.push(h);
    }
    match run_git(&root, &args) {
        Ok(out) => {
            let log = run_git(&root, &["bisect", "log"])?;
            let (current_hash, current_message, remaining, total, first_bad_hash, first_bad_message) = parse_bisect_log(&log);
            let is_done = out.contains("is the first bad commit") || out.contains("first bad commit");
            Ok(BisectStatus {
                in_progress: !is_done,
                step: if is_done { "done".to_string() } else { "running".to_string() },
                current_hash,
                current_message,
                remaining,
                total,
                first_bad_hash,
                first_bad_message,
                log,
            })
        }
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub async fn git_bisect_log(root: String) -> Result<String, String> {
    run_git(&root, &["bisect", "log"])
}

#[tauri::command]
pub async fn git_bisect_reset(root: String) -> Result<(), String> {
    run_git(&root, &["bisect", "reset"])?;
    Ok(())
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct MergeOptions {
    pub no_ff: Option<bool>,
    pub squash: Option<bool>,
}

#[tauri::command]
pub async fn git_merge(root: String, branch: String, options: Option<MergeOptions>) -> Result<(), String> {
    let opts = options.unwrap_or_default();
    let mut args = vec!["merge".to_string()];
    if opts.no_ff.unwrap_or(false) {
        args.push("--no-ff".to_string());
    }
    if opts.squash.unwrap_or(false) {
        args.push("--squash".to_string());
    }
    args.push(branch);
    run_git_strings(&root, &args)?;
    Ok(())
}

#[tauri::command]
pub async fn git_merge_abort(root: String) -> Result<(), String> {
    run_git(&root, &["merge", "--abort"])?;
    Ok(())
}

#[tauri::command]
pub async fn git_clone(url: String, path: String, depth: Option<u32>) -> Result<(), String> {
    let mut args = vec!["clone".to_string()];
    if let Some(d) = depth {
        args.push("--depth".to_string());
        args.push(d.to_string());
    }
    args.push(url);
    args.push(path);
    run_git_strings(".", &args)?;
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
