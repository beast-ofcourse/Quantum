use serde::{Deserialize, Serialize};
use crate::commands::git::{run_git, run_git_strings, run_git_lines, parse_diff_hunks, apply_patch, build_hunk_patch, unix_to_rfc3339};

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
pub struct FileStat {
    pub path: String,
    pub added: usize,
    pub deleted: usize,
}

#[tauri::command]
pub async fn git_diff(root: String, path: Option<String>, staged: Option<bool>) -> Result<String, String> {
    let mut args = vec!["diff".to_string(), "--no-color".to_string()];
    if staged.unwrap_or(false) { args.push("--cached".to_string()); }
    if let Some(p) = path { args.push(p); }
    run_git_strings(&root, &args)
}

#[tauri::command]
pub async fn git_show_file(root: String, path: String, revision: String) -> Result<String, String> {
    let rev_path = if revision.is_empty() {
        format!(":{}", path)
    } else {
        format!("{}:{}", revision, path)
    };
    run_git(&root, &["show", &rev_path])
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
