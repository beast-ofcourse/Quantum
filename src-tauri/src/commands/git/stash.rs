use serde::{Deserialize, Serialize};
use crate::commands::git::{run_git, run_git_lines, parse_diff_hunks, DiffHunk};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GitStash {
    pub index: usize,
    pub message: String,
    pub branch: String,
    pub hash: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct StashApplyResult {
    pub success: bool,
    pub has_conflict: bool,
    pub conflicted_files: Vec<String>,
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
pub async fn git_stash_show(root: String, index: usize) -> Result<Vec<DiffHunk>, String> {
    let out = run_git(
        &root,
        &["stash", "show", "-p", &format!("stash@{{{}}}", index)],
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
