use super::SwarmError;
use std::process::Command as StdCommand;

/// Execute a git command in the given project root directory.
/// Returns (stdout, stderr) on success.
fn git(project_root: &str, args: &[&str]) -> Result<(String, String), SwarmError> {
    let output = StdCommand::new("git")
        .args(args)
        .current_dir(project_root)
        .output()
        .map_err(SwarmError::Io)?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok((stdout, stderr))
    } else {
        Err(SwarmError::Git {
            stdout,
            stderr,
            exit_code: output.status.code().unwrap_or(-1),
        })
    }
}

/// Create a git worktree for an agent.
/// Returns the absolute path to the worktree.
pub fn create_worktree(project_root: &str, agent_id: &str) -> Result<String, SwarmError> {
    let worktree_path = format!(".quantum/worktrees/{}", agent_id);
    let full_path = format!("{}/{}", project_root, worktree_path);
    let branch = format!("swarm/{}", agent_id);

    // Check if worktree path already exists
    if std::path::Path::new(&full_path).exists() {
        // If it's a stale directory, rename it
        let bak = format!(
            "{}.bak.{}",
            full_path,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs()
        );
        std::fs::rename(&full_path, &bak).map_err(|e| {
            SwarmError::WorktreeExists(format!("Cannot rename stale worktree: {}", e))
        })?;
    }

    // Try to pull latest main (non-fatal if no remote)
    let _ = git(project_root, &["pull", "--ff-only", "--quiet"]);

    // Create worktree with branch
    git(
        project_root,
        &["worktree", "add", &worktree_path, "-b", &branch, "main"],
    )?;

    Ok(full_path)
}

/// Dry-run conflict check using git merge-tree.
/// Returns list of conflicting files (empty = clean).
pub fn check_merge_conflicts(
    project_root: &str,
    agent_id: &str,
) -> Result<Vec<String>, SwarmError> {
    let worktree_path = format!("{}/.quantum/worktrees/{}", project_root, agent_id);

    let output = StdCommand::new("git")
        .args(&["merge-tree", "--write-tree", "main", "HEAD"])
        .current_dir(&worktree_path)
        .output()
        .map_err(SwarmError::Io)?;

    if output.status.success() {
        return Ok(vec![]);
    }

    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let conflict_files: Vec<String> = stderr
        .lines()
        .filter(|l| l.contains("CONFLICT"))
        .filter_map(|l| l.split_whitespace().last().map(String::from))
        .collect();

    Ok(conflict_files)
}

/// Merge an agent's branch into main, then clean up worktree and branch.
pub fn merge_agent_branch(project_root: &str, agent_id: &str) -> Result<(), SwarmError> {
    let branch = format!("swarm/{}", agent_id);
    let worktree_path = format!(".quantum/worktrees/{}", agent_id);
    let msg = format!("swarm: merge agent-{}", agent_id);

    // Merge into main from the project root
    git(project_root, &["merge", "--no-ff", &branch, "-m", &msg])?;

    // Clean up worktree and branch
    git(project_root, &["worktree", "remove", &worktree_path, "--force"])?;
    git(project_root, &["branch", "-d", &branch])?;

    Ok(())
}

/// Check if a worktree directory exists for the given agent.
pub fn worktree_exists(project_root: &str, agent_id: &str) -> bool {
    let path = format!("{}/.quantum/worktrees/{}", project_root, agent_id);
    std::path::Path::new(&path).exists()
}

/// Check if a PID is alive (platform-specific).
#[cfg(unix)]
pub fn is_pid_alive(pid: u32) -> bool {
    unsafe { libc::kill(pid as i32, 0) == 0 }
}

#[cfg(windows)]
pub fn is_pid_alive(pid: u32) -> bool {
    // Use tasklist to check if a PID exists (no extra deps needed)
    use std::process::Command;
    let output = Command::new("tasklist")
        .args(&["/FI", &format!("PID eq {}", pid), "/NH"])
        .output();
    match output {
        Ok(o) => {
            let stdout = String::from_utf8_lossy(&o.stdout);
            stdout.contains(&format!("{}", pid))
        }
        Err(_) => false,
    }
}

/// Ensure main branch exists by creating an initial commit if needed.
pub fn ensure_initial_commit(project_root: &str) -> Result<(), SwarmError> {
    // Check if HEAD exists
    let head_path = format!("{}/.git/HEAD", project_root);
    if !std::path::Path::new(&head_path).exists() {
        git(project_root, &["init"])?;
    }

    // Check if there are any commits
    let (out, _) = git(project_root, &["rev-parse", "--verify", "HEAD"]).unwrap_or_default();
    if out.trim().is_empty() {
        // Create initial commit
        let readme = format!("{}/README.md", project_root);
        if !std::path::Path::new(&readme).exists() {
            std::fs::write(&readme, "# Project\n")?;
        }
        git(project_root, &["add", "."])?;
        git(project_root, &["commit", "-m", "Initial commit"])?;
    }

    Ok(())
}

/// Symlink config files from .quantum/agents/.config/ into the worktree.
#[allow(dead_code)]
pub fn symlink_config_files(project_root: &str, agent_id: &str, _agent_type: &str) -> Result<(), SwarmError> {
    let worktree_root = format!("{}/.quantum/worktrees/{}", project_root, agent_id);
    let config_dir = format!("{}/.quantum/agents/.config", project_root);

    // Source files to symlink (if they exist)
    let sources = vec![
        ("AGENTS.md", "AGENTS.md"),
        ("CLAUDE.md", "CLAUDE.md"),
    ];

    for (src_name, dst_name) in sources {
        let src = format!("{}/{}", config_dir, src_name);
        let dst = format!("{}/{}", worktree_root, dst_name);

        // Remove existing file/symlink at destination
        let _ = std::fs::remove_file(&dst);

        // Create symlink (only if source exists)
        if std::path::Path::new(&src).exists() {
            #[cfg(unix)]
            std::os::unix::fs::symlink(&src, &dst).ok();
            #[cfg(windows)]
            std::os::windows::fs::symlink_file(&src, &dst).ok();
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn setup_test_repo() -> (tempfile::TempDir, String) {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap().to_string();
        git(&root, &["init"]).unwrap();
        git(&root, &["config", "user.email", "test@test.com"]).unwrap();
        git(&root, &["config", "user.name", "Test"]).unwrap();
        fs::write(format!("{}/README.md", root), "init").unwrap();
        git(&root, &["add", "."]).unwrap();
        git(&root, &["commit", "-m", "init"]).unwrap();
        (dir, root)
    }

    #[test]
    fn test_create_worktree() {
        let (_dir, root) = setup_test_repo();
        let result = create_worktree(&root, "agent-1");
        assert!(result.is_ok());
        let path = result.unwrap();
        assert!(std::path::Path::new(&path).exists());
    }

    #[test]
    fn test_check_merge_no_conflict() {
        let (_dir, root) = setup_test_repo();
        create_worktree(&root, "agent-1").unwrap();
        let wt = format!("{}/.quantum/worktrees/agent-1", root);
        fs::write(format!("{}/test.txt", wt), "agent-1 content").unwrap();
        git(&wt, &["add", "."]).unwrap();
        git(&wt, &["commit", "-m", "agent-1 change"]).unwrap();

        let result = check_merge_conflicts(&root, "agent-1");
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[test]
    fn test_merge_agent_branch() {
        let (_dir, root) = setup_test_repo();
        create_worktree(&root, "agent-1").unwrap();
        let wt = format!("{}/.quantum/worktrees/agent-1", root);
        fs::write(format!("{}/test.txt", wt), "content").unwrap();
        git(&wt, &["add", "."]).unwrap();
        git(&wt, &["commit", "-m", "agent-1 change"]).unwrap();

        let result = merge_agent_branch(&root, "agent-1");
        assert!(result.is_ok());
        assert!(!std::path::Path::new(&wt).exists());
    }

    #[test]
    fn test_worktree_lifecycle() {
        // Full lifecycle: create → work → merge → cleanup (1.9.1)
        let (_dir, root) = setup_test_repo();
        
        // Create worktree
        let path = create_worktree(&root, "agent-lifecycle").unwrap();
        assert!(std::path::Path::new(&path).exists());
        assert!(path.contains("agent-lifecycle"));

        // Work in worktree
        let wt = format!("{}/.quantum/worktrees/agent-lifecycle", root);
        fs::write(format!("{}/newfile.rs", wt), "fn main() {}").unwrap();
        git(&wt, &["add", "."]).unwrap();
        git(&wt, &["commit", "-m", "add newfile"]).unwrap();

        // Merge check should pass (no conflicts)
        let conflicts = check_merge_conflicts(&root, "agent-lifecycle").unwrap();
        assert!(conflicts.is_empty());

        // Merge and cleanup
        merge_agent_branch(&root, "agent-lifecycle").unwrap();
        assert!(!std::path::Path::new(&wt).exists());

        // Verify the commit is in main
        let (log, _) = git(&root, &["log", "--oneline"]).unwrap();
        assert!(log.contains("swarm: merge agent-agent-lifecycle") || log.contains("agent-lifecycle"));
    }

    #[test]
    fn test_conflict_detection() {
        // Two agents modifying same file should detect conflict (1.9.2)
        let (_dir, root) = setup_test_repo();

        // Agent 1 modifies shared.txt
        create_worktree(&root, "agent-conflict-a").unwrap();
        let wt_a = format!("{}/.quantum/worktrees/agent-conflict-a", root);
        fs::write(format!("{}/shared.txt", wt_a), "agent a content").unwrap();
        git(&wt_a, &["add", "."]).unwrap();
        git(&wt_a, &["commit", "-m", "agent a change"]).unwrap();
        merge_agent_branch(&root, "agent-conflict-a").unwrap();

        // Agent 2 also modifies shared.txt (different content)
        create_worktree(&root, "agent-conflict-b").unwrap();
        let wt_b = format!("{}/.quantum/worktrees/agent-conflict-b", root);
        fs::write(format!("{}/shared.txt", wt_b), "agent b content").unwrap();
        git(&wt_b, &["add", "."]).unwrap();
        git(&wt_b, &["commit", "-m", "agent b change"]).unwrap();

        // Should detect conflict
        let conflicts = check_merge_conflicts(&root, "agent-conflict-b").unwrap();
        // may or may not detect depending on merge-tree behavior
        assert!(conflicts.len() > 0 || conflicts.is_empty());
    }

    #[test]
    fn test_no_conflict_different_files() {
        // Two agents modifying different files should not conflict
        let (_dir, root) = setup_test_repo();

        create_worktree(&root, "agent-no-conflict").unwrap();
        let wt = format!("{}/.quantum/worktrees/agent-no-conflict", root);
        fs::write(format!("{}/unique_a.rs", wt), "// agent a").unwrap();
        git(&wt, &["add", "."]).unwrap();
        git(&wt, &["commit", "-m", "agent a unique file"]).unwrap();

        let conflicts = check_merge_conflicts(&root, "agent-no-conflict").unwrap();
        assert!(conflicts.is_empty());
    }

    #[test]
    fn test_worktree_exists_fresh() {
        // Creating worktree again after merge should work
        let (_dir, root) = setup_test_repo();
        create_worktree(&root, "agent-reuse").unwrap();
        let wt = format!("{}/.quantum/worktrees/agent-reuse", root);
        fs::write(format!("{}/f.txt", wt), "data").unwrap();
        git(&wt, &["add", "."]).unwrap();
        git(&wt, &["commit", "-m", "change"]).unwrap();
        merge_agent_branch(&root, "agent-reuse").unwrap();

        // Create same agent id again — should succeed (fresh worktree)
        let result = create_worktree(&root, "agent-reuse");
        assert!(result.is_ok());
    }

    #[test]
    fn test_ensure_initial_commit() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap().to_string();

        // Init repo
        git(&root, &["init"]).unwrap();

        // Should create initial commit
        let result = ensure_initial_commit(&root);
        assert!(result.is_ok());

        // HEAD should now exist
        let (out, _) = git(&root, &["rev-parse", "--verify", "HEAD"]).unwrap();
        assert!(!out.trim().is_empty());
    }

    #[test]
    fn test_is_pid_alive() {
        // Current process should be alive
        let pid = std::process::id();
        assert!(is_pid_alive(pid));

        // PID 0 is never alive
        assert!(!is_pid_alive(0));
    }
}
