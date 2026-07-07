use std::io::Write;
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

// ── Sub-modules ──

mod status;
mod branch;
mod diff;
mod stash;
mod remote;
mod commit;

pub use status::*;
pub use branch::*;
pub use diff::*;
pub use stash::*;
pub use remote::*;
pub use commit::*;

// ── Diff utilities (shared by diff.rs and stash.rs) ──
// Types DiffHunk and DiffLine are in scope via `pub use diff::*`

pub fn parse_diff_hunks(diff_output: &str, file_path: &str) -> Vec<DiffHunk> {
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

pub fn apply_patch(root: &str, patch_content: &str, reverse: bool) -> Result<(), String> {
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

pub fn build_hunk_patch(file_path: &str, hunk: &DiffHunk) -> String {
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

pub fn write_editor_script(content: &str, editor_file_name: &str) -> Result<String, String> {
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

pub fn clean_editor_files(editor_file_name: &str) {
    let temp_dir = std::env::temp_dir();
    let pid = std::process::id();
    let _ = std::fs::remove_file(temp_dir.join(format!("code-editor-{}-{}.txt", editor_file_name, pid)));
    let _ = std::fs::remove_file(temp_dir.join(format!("code-editor-{}-{}.bat", editor_file_name, pid)));
    let _ = std::fs::remove_file(temp_dir.join(format!("code-editor-{}-{}.sh", editor_file_name, pid)));
}
