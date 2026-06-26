use serde::{Deserialize, Serialize};
use crate::commands::git::{cmd, run_git, run_git_lines};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GitRemote {
    pub name: String,
    pub fetch_url: Option<String>,
    pub push_url: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct PushOptions { pub force_with_lease: Option<bool>, pub tags: Option<bool>, pub upstream: Option<bool> }

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct PullOptions { pub rebase: Option<bool>, pub ff_only: Option<bool> }

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct FetchOptions { pub prune: Option<bool>, pub tags: Option<bool> }

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
        let env_val = format!("http.extraHeader=Authorization: Bearer {}", t);
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
        let env_val = format!("http.extraHeader=Authorization: Bearer {}", t);
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
        let env_val = format!("http.extraHeader=Authorization: Bearer {}", t);
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

// ── Tags ──

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GitTag {
    pub name: String,
    pub hash: String,
    pub date: String,
    pub message: String,
    pub is_annotated: bool,
}

#[tauri::command]
pub async fn git_tag_list(root: String) -> Result<Vec<GitTag>, String> {
    let out = run_git(
        &root,
        &["tag", "--list", "--format=%(refname:short)|%(objectname)|%(taggerdate)|%(contents:subject)"],
    )?;
    let mut tags = Vec::new();
    for line in out.lines() {
        let line = line.trim();
        if line.is_empty() { continue; }
        let parts: Vec<&str> = line.splitn(4, '|').collect();
        if parts.len() < 2 { continue; }
        let name = parts[0].to_string();
        let hash = parts[1].to_string();
        let date = parts.get(2).unwrap_or(&"").trim().to_string();
        let message = parts.get(3).unwrap_or(&"").trim().to_string();
        let is_annotated = !date.is_empty();
        tags.push(GitTag { name, hash, date, message, is_annotated });
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
        let env_val = format!("http.extraHeader=Authorization: Bearer {}", t);
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
