use serde::{Deserialize, Serialize};
use crate::commands::git::{cmd, run_git, run_git_strings, write_editor_script, clean_editor_files, FileStat};

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

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct MergeOptions {
    pub no_ff: Option<bool>,
    pub squash: Option<bool>,
}

// ── Basic commit / add / reset / config ──

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

// ── Graph ──

fn parse_graph_refs(refs_str: &str, hash: &str) -> Vec<GraphRef> {
    fn classify(name: &str) -> String {
        if name.starts_with("origin/") { "remote".to_string() } else { "branch".to_string() }
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

// ── Commit detail ──

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
        if line.is_empty() || line.starts_with("diff --git") { break; }
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() >= 3 {
            if let (Ok(added), Ok(deleted)) = (parts[0].parse::<usize>(), parts[1].parse::<usize>()) {
                stats.push(FileStat { path: parts[2..].join("\t"), added, deleted });
            }
        }
        idx += 1;
    }

    while idx < lines.len() && lines[idx].trim().is_empty() { idx += 1; }

    let diff = lines[idx..].join("\n");

    Ok(CommitDetail { hash: commit_hash, message, author_name, author_email, date, committer, stats, diff })
}

// ── Config ──

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

// ── Cherry-pick ──

fn detect_cherry_pick_state(root: &str) -> Result<CherryPickStatus, String> {
    let git_dir = run_git(root, &["rev-parse", "--git-dir"])?.trim().to_string();
    let cherry_pick_head = std::path::Path::new(&git_dir).join("CHERRY_PICK_HEAD");
    if !cherry_pick_head.exists() {
        return Ok(CherryPickStatus { in_progress: false, current_hash: String::new(), has_conflict: false });
    }
    let current_hash = std::fs::read_to_string(&cherry_pick_head).unwrap_or_default().trim().to_string();
    let has_conflict = run_git(root, &["diff", "--name-only", "--diff-filter=U"])
        .map(|s| !s.trim().is_empty()).unwrap_or(false);
    Ok(CherryPickStatus { in_progress: true, current_hash, has_conflict })
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
    if opts.no_commit.unwrap_or(false) { args.push("--no-commit".to_string()); }
    if opts.strategy_theirs.unwrap_or(false) { args.push("-X".to_string()); args.push("theirs".to_string()); }
    if let Some(hashes) = &opts.hashes {
        for h in hashes { args.push(h.clone()); }
    } else {
        args.push(hash);
    }
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let output = cmd("git").args(&refs).current_dir(&root).output()
        .map_err(|e| format!("Git command failed: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let state = detect_cherry_pick_state(&root)?;
        if state.in_progress { return Ok(state); }
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
    let output = cmd("git").args(["cherry-pick", "--continue"]).current_dir(&root).output()
        .map_err(|e| format!("Git command failed: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let state = detect_cherry_pick_state(&root)?;
        if state.in_progress { return Ok(state); }
        return Err(stderr.trim().to_string());
    }
    detect_cherry_pick_state(&root)
}

#[tauri::command]
pub async fn git_cherry_pick_abort(root: String) -> Result<CherryPickStatus, String> {
    let output = cmd("git").args(["cherry-pick", "--abort"]).current_dir(&root).output()
        .map_err(|e| format!("Git command failed: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(stderr.trim().to_string());
    }
    Ok(CherryPickStatus { in_progress: false, current_hash: String::new(), has_conflict: false })
}

// ── Revert ──

fn detect_revert_state(root: &str) -> Result<RevertStatus, String> {
    let git_dir = run_git(root, &["rev-parse", "--git-dir"])?.trim().to_string();
    let revert_head = std::path::Path::new(&git_dir).join("REVERT_HEAD");
    if !revert_head.exists() {
        return Ok(RevertStatus { in_progress: false, current_hash: String::new(), has_conflict: false });
    }
    let current_hash = std::fs::read_to_string(&revert_head).unwrap_or_default().trim().to_string();
    let has_conflict = run_git(root, &["diff", "--name-only", "--diff-filter=U"])
        .map(|s| !s.trim().is_empty()).unwrap_or(false);
    Ok(RevertStatus { in_progress: true, current_hash, has_conflict })
}

#[tauri::command]
pub async fn git_revert(root: String, hash: String, options: Option<RevertOptions>) -> Result<RevertStatus, String> {
    let status = run_git(&root, &["status", "--porcelain"])?;
    if !status.trim().is_empty() {
        return Err("Uncommitted changes — commit or stash before reverting".to_string());
    }
    let opts = options.unwrap_or_default();
    let mut args = vec!["revert".to_string()];
    if opts.no_commit.unwrap_or(false) { args.push("--no-commit".to_string()); }
    if let Some(pn) = opts.parent_number { args.push("-m".to_string()); args.push(pn.to_string()); }
    args.push("--no-edit".to_string());
    args.push(hash);
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let output = cmd("git").args(&refs).current_dir(&root).output()
        .map_err(|e| format!("Git command failed: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let state = detect_revert_state(&root)?;
        if state.in_progress { return Ok(state); }
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
    let output = cmd("git").args(["revert", "--continue"]).current_dir(&root).output()
        .map_err(|e| format!("Git command failed: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let state = detect_revert_state(&root)?;
        if state.in_progress { return Ok(state); }
        return Err(stderr.trim().to_string());
    }
    detect_revert_state(&root)
}

#[tauri::command]
pub async fn git_revert_abort(root: String) -> Result<RevertStatus, String> {
    let output = cmd("git").args(["revert", "--abort"]).current_dir(&root).output()
        .map_err(|e| format!("Git command failed: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(stderr.trim().to_string());
    }
    Ok(RevertStatus { in_progress: false, current_hash: String::new(), has_conflict: false })
}

// ── Interactive rebase ──

fn detect_rebase_state(root: &str) -> Result<RebaseStatus, String> {
    let git_dir = run_git(root, &["rev-parse", "--git-dir"])?.trim().to_string();
    let rebase_dir = std::path::Path::new(&git_dir).join("rebase-merge");
    if !rebase_dir.exists() {
        return Ok(RebaseStatus {
            in_progress: false, total: 0, current: 0,
            current_hash: String::new(), current_message: String::new(),
            pause_reason: "none".to_string(), has_conflict: false,
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
            match action { "reword" => "reword", "edit" => "edit", _ => "todoEdit" }.to_string()
        } else { "none".to_string() }
    } else { "none".to_string() };
    Ok(RebaseStatus {
        in_progress: true, total: end, current: msgnum,
        current_hash, current_message, pause_reason, has_conflict,
    })
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
        let todo_content = std::fs::read_to_string(rebase_dir.join("git-rebase-todo")).unwrap_or_default();
        let done_content = std::fs::read_to_string(rebase_dir.join("done")).unwrap_or_default();
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
            todos.push(RebaseTodo { index: done_count + i, original_index: done_count + i, action, hash, message });
        }
        return Ok(todos);
    }
    if let Some(t) = target {
        let target = t.trim();
        if target.is_empty() { return Err("Target branch or commit is required".to_string()); }
        let out = run_git(&root, &["log", "--reverse", &format!("{}..HEAD", target), "--format=%H|%s", "--no-color"])?;
        let mut todos = Vec::new();
        for (i, line) in out.lines().enumerate() {
            let line = line.trim();
            if line.is_empty() { continue; }
            let parts: Vec<&str> = line.splitn(2, '|').collect();
            if parts.len() < 2 { continue; }
            todos.push(RebaseTodo { index: i, original_index: i, action: "pick".to_string(), hash: parts[0].to_string(), message: parts[1].to_string() });
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
        format!("{} {} {}\n", t.action, t.hash, t.message.replace('\n', " "))
    }).collect();
    let script_path = write_editor_script(&todo_content, "rebase-sequence")?;
    {
        let output = cmd("git").args(["rebase", "-i", &target]).current_dir(&root)
            .env("GIT_SEQUENCE_EDITOR", &script_path).output()
            .map_err(|e| format!("Failed to start rebase: {}", e))?;
        if !output.status.success() {
            clean_editor_files("rebase-sequence");
            let state = detect_rebase_state(&root)?;
            if state.in_progress { return Ok(state); }
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            return Err(stderr.trim().to_string());
        }
    }
    clean_editor_files("rebase-sequence");
    detect_rebase_state(&root)
}

#[tauri::command]
pub async fn git_rebase_edit_todo(root: String, todos: Vec<RebaseTodo>) -> Result<RebaseStatus, String> {
    let git_dir = run_git(&root, &["rev-parse", "--git-dir"])?.trim().to_string();
    let todo_path = std::path::Path::new(&git_dir).join("rebase-merge").join("git-rebase-todo");
    if !todo_path.exists() { return Err("No rebase in progress".to_string()); }
    let content: String = todos.iter().map(|t| {
        format!("{} {} {}\n", t.action, t.hash, t.message.replace('\n', " "))
    }).collect();
    let backup_path = std::path::PathBuf::from(format!("{}.backup", todo_path.display()));
    let _ = std::fs::copy(&todo_path, &backup_path);
    std::fs::write(&todo_path, &content).map_err(|e| format!("Failed to write todo: {}", e))?;
    detect_rebase_state(&root)
}

#[tauri::command]
pub async fn git_rebase_continue(root: String, message: Option<String>) -> Result<RebaseStatus, String> {
    let output = if let Some(msg) = message {
        let script_path = write_editor_script(&msg, "rebase-message")?;
        let out = cmd("git").args(["rebase", "--continue"]).current_dir(&root)
            .env("GIT_EDITOR", &script_path).output()
            .map_err(|e| format!("Failed to continue rebase: {}", e))?;
        clean_editor_files("rebase-message");
        out
    } else {
        cmd("git").args(["rebase", "--continue"]).current_dir(&root).output()
            .map_err(|e| format!("Failed to continue rebase: {}", e))?
    };
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let state = detect_rebase_state(&root)?;
        if state.in_progress { return Ok(state); }
        return Err(stderr.trim().to_string());
    }
    detect_rebase_state(&root)
}

#[tauri::command]
pub async fn git_rebase_skip(root: String) -> Result<RebaseStatus, String> {
    let output = cmd("git").args(["rebase", "--skip"]).current_dir(&root).output()
        .map_err(|e| format!("Failed to skip: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let state = detect_rebase_state(&root)?;
        if state.in_progress { return Ok(state); }
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
        if result.is_err() { run_git(&root, &["rebase", "--quit"])?; }
    };
    detect_rebase_state(&root)
}

// ── Bisect ──

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
        } else if trimmed.starts_with('#') { continue; }
        else if !trimmed.is_empty() {
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
        for p in paths { args.push(p); }
    }
    run_git(&root, &args)?;
    let log = run_git(&root, &["bisect", "log"])?;
    let (current_hash, current_message, remaining, total, first_bad_hash, first_bad_message) = parse_bisect_log(&log);
    Ok(BisectStatus {
        in_progress: true, step: "running".to_string(),
        current_hash, current_message, remaining, total,
        first_bad_hash, first_bad_message, log,
    })
}

#[tauri::command]
pub async fn git_bisect_state(root: String, state: String, hash: Option<String>) -> Result<BisectStatus, String> {
    let valid_states = ["good", "bad", "skip"];
    if !valid_states.contains(&state.as_str()) {
        return Err(format!("Invalid bisect state: {}. Use good, bad, or skip.", state));
    }
    let mut args = vec!["bisect", &state];
    if let Some(ref h) = hash { args.push(h); }
    match run_git(&root, &args) {
        Ok(out) => {
            let log = run_git(&root, &["bisect", "log"])?;
            let (current_hash, current_message, remaining, total, first_bad_hash, first_bad_message) = parse_bisect_log(&log);
            let is_done = out.contains("is the first bad commit") || out.contains("first bad commit");
            Ok(BisectStatus {
                in_progress: !is_done,
                step: if is_done { "done".to_string() } else { "running".to_string() },
                current_hash, current_message, remaining, total,
                first_bad_hash, first_bad_message, log,
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

// ── Merge ──

#[tauri::command]
pub async fn git_merge(root: String, branch: String, options: Option<MergeOptions>) -> Result<(), String> {
    let opts = options.unwrap_or_default();
    let mut args = vec!["merge".to_string()];
    if opts.no_ff.unwrap_or(false) { args.push("--no-ff".to_string()); }
    if opts.squash.unwrap_or(false) { args.push("--squash".to_string()); }
    args.push(branch);
    run_git_strings(&root, &args)?;
    Ok(())
}

#[tauri::command]
pub async fn git_merge_abort(root: String) -> Result<(), String> {
    run_git(&root, &["merge", "--abort"])?;
    Ok(())
}

// ── Clone ──

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
