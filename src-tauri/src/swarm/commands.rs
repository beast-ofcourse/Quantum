use super::git;
use super::keyring;
use super::state::{
    generate_swarm_id, AgentInfo, AgentManifest, AgentStatus, AgentType, MergeCheckResult,
    MergeQueueItem, ReconciliationReport, SwarmConfig, SwarmPhase, SwarmState, Task, TaskSpec,
    TimelineEvent,
};
use super::watcher;
use super::SwarmError;
use crate::commands::pty;
use std::collections::HashMap;
use std::path::Path;
use tauri::{AppHandle, Emitter};

/// Helper: emit a timeline event and append to state.
fn emit_timeline(
    state: &SwarmState,
    app: &AppHandle,
    agent: &str,
    event_type: &str,
    detail: Option<&str>,
    file: Option<&str>,
) {
    let event = TimelineEvent {
        t: crate_now(),
        agent: agent.to_string(),
        r#type: event_type.to_string(),
        detail: detail.map(String::from),
        file: file.map(String::from),
    };
    let _ = app.emit("swarm:timeline-event", &event);
}

fn crate_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let dur = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    let secs = dur.as_secs();
    let nanos = dur.subsec_nanos();
    format!("{}", chrono_format(secs, nanos))
}

fn chrono_format(secs: u64, _nanos: u32) -> String {
    let days = secs / 86400;
    let time_secs = secs % 86400;
    let hours = time_secs / 3600;
    let minutes = (time_secs % 3600) / 60;
    let seconds = time_secs % 60;

    let mut y = 1970i64;
    let mut d = days as i64;
    loop {
        let days_in_year = if is_leap(y) { 366 } else { 365 };
        if d < days_in_year { break; }
        d -= days_in_year;
        y += 1;
    }
    let month_days = if is_leap(y) {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    let mut m = 0;
    for (i, &md) in month_days.iter().enumerate() {
        if d < md { m = i + 1; break; }
        d -= md;
    }
    let day = d + 1;
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.000Z", y, m, day, hours, minutes, seconds)
}

fn is_leap(year: i64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

/// Read swarm-state.json and deserialize.
fn read_swarm_state(project_root: &str) -> Result<SwarmState, SwarmError> {
    let path = format!("{}/.quantum/swarm-state.json", project_root);
    let content = std::fs::read_to_string(&path)?;
    serde_json::from_str(&content).map_err(SwarmError::Json)
}

/// Write swarm-state.json atomically.
fn write_swarm_state(project_root: &str, state: &SwarmState) -> Result<(), SwarmError> {
    let path = format!("{}/.quantum/swarm-state.json", project_root);
    let tmp = format!("{}.tmp", path);
    let content = serde_json::to_string_pretty(state)?;

    // Ensure .quantum directory exists
    if let Some(parent) = Path::new(&path).parent() {
        std::fs::create_dir_all(parent)?;
    }

    std::fs::write(&tmp, &content)?;
    std::fs::rename(&tmp, &path)?;
    Ok(())
}

// ── Commands ──────────────────────────────────────────

/// Initialize swarm: create .quantum/ structure, write initial swarm-state.json
#[tauri::command]
pub fn init_swarm(
    app: AppHandle,
    project_root: String,
    name: String,
) -> Result<SwarmState, SwarmError> {
    let swarm_id = generate_swarm_id();
    let mut state = SwarmState::new(swarm_id, name);
    state.phase = SwarmPhase::Executing;
    state.version = 1;

    // Create directory structure
    let quantum_dir = format!("{}/.quantum", project_root);
    let agents_dir = format!("{}/.quantum/agents", project_root);
    let config_dir = format!("{}/.quantum/agents/.config", project_root);
    let worktrees_dir = format!("{}/.quantum/worktrees", project_root);

    std::fs::create_dir_all(&quantum_dir)?;
    std::fs::create_dir_all(&agents_dir)?;
    std::fs::create_dir_all(&config_dir)?;
    std::fs::create_dir_all(&worktrees_dir)?;

    // Ensure main branch exists
    git::ensure_initial_commit(&project_root)?;

    write_swarm_state(&project_root, &state)?;

    // Start FS watcher for agent manifests
    watcher::start_swarm_watcher(app, project_root.clone());

    Ok(state)
}

/// Add an agent + task, create worktree, write context.md.
/// Returns the agent ID.
#[tauri::command]
pub fn add_agent(
    app: AppHandle,
    project_root: String,
    task: TaskSpec,
) -> Result<String, SwarmError> {
    let agent_id = format!("agent-{}", generate_task_id());

    // Determine agent type
    let agent_type = match task.agent_type.as_str() {
        "kilocode" => AgentType::Kilocode,
        _ => AgentType::Opencode,
    };

    let model = if task.model.is_empty() {
        "deepseek-v4-flash-free".to_string()
    } else {
        task.model.clone()
    };

    let branch = format!("swarm/{}", agent_id);
    let worktree_path = format!(".quantum/worktrees/{}", agent_id);
    let full_worktree = format!("{}/{}", project_root, worktree_path);

    // Create worktree
    git::create_worktree(&project_root, &agent_id)?;

    // Create agent directory for context/manifest
    let agent_dir = format!("{}/.quantum/agents/{}", project_root, agent_id);
    std::fs::create_dir_all(&agent_dir)?;

    // Write initial context.md
    write_context_md(&project_root, &agent_id, &task, &agent_type, &model)?;

    // Create task
    let task_id = format!("task-{}", generate_task_id());
    let swarm_task = Task {
        id: task_id.clone(),
        description: task.description,
        status: "pending".into(),
        assigned_to: Some(agent_id.clone()),
        depends_on: task.depends_on,
        priority: 0,
    };

    // Register agent in state
    let agent = AgentInfo {
        id: agent_id.clone(),
        agent_type,
        model,
        task_id: task_id.clone(),
        status: AgentStatus::Idle,
        pid: None,
        session_id: None,
        worktree_path: full_worktree,
        branch,
        depends_on: vec![],
        heartbeat_at: None,
        exit_code: None,
        manifest: serde_json::json!({}),
    };

    // Update state
    let mut state = read_swarm_state(&project_root)?;
    state.agents.insert(agent_id.clone(), agent);
    state.tasks.push(swarm_task);
    state.merge_queue.push(MergeQueueItem {
        agent_id: agent_id.clone(),
        branch: format!("swarm/{}", agent_id),
        task_id,
        status: "pending".into(),
    });
    write_swarm_state(&project_root, &state)?;

    emit_timeline(
        &state,
        &app,
        &agent_id,
        "agent_created",
        Some("Agent worktree created"),
        None,
    );

    Ok(agent_id)
}

/// Write context.md for an agent (used by coordination service).
#[tauri::command]
pub fn write_agent_context(
    project_root: String,
    agent_id: String,
    content: String,
) -> Result<(), SwarmError> {
    let path = format!("{}/.quantum/agents/{}/context.md", project_root, agent_id);
    std::fs::write(&path, &content)?;
    Ok(())
}

// Internal: build context.md content
fn write_context_md(
    project_root: &str,
    agent_id: &str,
    task: &TaskSpec,
    agent_type: &AgentType,
    model: &str,
) -> Result<(), SwarmError> {
    let agent_dir = format!("{}/.quantum/agents/{}", project_root, agent_id);
    let worktree = format!("{}/.quantum/worktrees/{}", project_root, agent_id);
    let branch = format!("swarm/{}", agent_id);

    let context = format!(
        "# Task\n\
         {}\n\n\
         # Your Environment\n\
         - Worktree: {}  (this is your working directory)\n\
         - Branch:   {}  (already checked out — do not run git checkout)\n\
         - Agent ID: {}\n\
         - Model:    {}\n\n\
         # Protocol\n\
         1. Work freely in this directory — all files are yours (git isolated worktree).\n\
         2. Do NOT run `git checkout` or `git worktree` commands.\n\
         3. Write status periodically to: {}/manifest.json\n\
            Format: {{{{ \"status\": \"running\", \"currentThought\": \"...\", \"filesModified\": [\"src/auth.ts\"] }}}}\n\
         4. Exit your process when the task is complete.\n",
        task.description,
        worktree,
        branch,
        agent_id,
        model,
        agent_dir,
    );

    std::fs::write(
        format!("{}/context.md", agent_dir),
        &context,
    )?;
    Ok(())
}

/// Spawn a PTY for an already-registered agent.
/// Injects QUANTUM_* env vars + API keys from keyring.
#[tauri::command]
pub async fn spawn_agent_pty(
    app: AppHandle,
    project_root: String,
    agent_id: String,
) -> Result<i32, String> {
    // Read current state
    let mut state = read_swarm_state(&project_root).map_err(|e| e.to_string())?;

    let agent = state
        .agents
        .get(&agent_id)
        .ok_or_else(|| format!("Agent not found: {}", agent_id))?
        .clone();

    if agent.status != AgentStatus::Idle && agent.status != AgentStatus::Waiting {
        return Err(format!("Agent {} is not idle (status: {:?})", agent_id, agent.status));
    }

    // Build env vars
    let env_vars = keyring::build_agent_env(
        &project_root,
        &agent_id,
        &agent.agent_type.to_string(),
        &agent.model,
        &state.swarm_id,
    )
    .map_err(|e| e.to_string())?;

    let env_map: HashMap<String, String> = env_vars.into_iter().collect();

    // Generate session ID
    let session_id = format!("swarm-{}", agent_id);

    // Determine shell (use default or configured)
    let shell_path = std::env::var("SHELL").unwrap_or_else(|_| {
        if cfg!(windows) { "cmd.exe".into() } else { "/bin/sh".into() }
    });

    // Spawn PTY with env vars injected
    let pid = pty::spawn_pty_internal(
        app.clone(),
        session_id.clone(),
        shell_path,
        vec![],
        agent.worktree_path.clone(),
        80,
        24,
        Some(env_map),
    )
    .await
    .map_err(|e| format!("Failed to spawn PTY: {}", e))?;

    // Update state
    state.agents.get_mut(&agent_id).unwrap().status = AgentStatus::Running;
    state.agents.get_mut(&agent_id).unwrap().pid = Some(pid);
    state.agents.get_mut(&agent_id).unwrap().session_id = Some(session_id.clone());
    state.agents.get_mut(&agent_id).unwrap().heartbeat_at = Some(crate_now());
    write_swarm_state(&project_root, &state).map_err(|e| e.to_string())?;

    emit_timeline(
        &state,
        &app,
        &agent_id,
        "agent_started",
        Some("PTY spawned"),
        None,
    );

    Ok(pid)
}

/// Get current swarm state (full).
#[tauri::command]
pub fn get_swarm_state(project_root: String) -> Result<SwarmState, String> {
    read_swarm_state(&project_root).map_err(|e| e.to_string())
}

/// Kill an agent: mark as failed, release locks.
#[tauri::command]
pub fn kill_agent(project_root: String, agent_id: String) -> Result<(), String> {
    let mut state = read_swarm_state(&project_root).map_err(|e| e.to_string())?;

    if let Some(agent) = state.agents.get(&agent_id) {
        // Kill the PTY if we have a session
        if let Some(ref session_id) = agent.session_id {
            // We can't directly call kill_pty here because it's async,
            // but we can mark the agent as failed and let the PTY cleanup handle it
        }
    }

    // Mark agent as failed
    if let Some(agent) = state.agents.get_mut(&agent_id) {
        agent.status = AgentStatus::Failed;
        // Release file locks held by this agent
        state.file_locks.retain(|_, lock| lock.locked_by != agent_id);
    }

    write_swarm_state(&project_root, &state).map_err(|e| e.to_string())
}

/// Dry-run merge check.
#[tauri::command]
pub fn check_merge(
    project_root: String,
    agent_id: String,
) -> Result<MergeCheckResult, String> {
    let conflict_files =
        git::check_merge_conflicts(&project_root, &agent_id).map_err(|e| e.to_string())?;

    Ok(MergeCheckResult {
        has_conflict: !conflict_files.is_empty(),
        conflict_files,
    })
}

/// Execute actual merge after check passes.
#[tauri::command]
pub fn merge_agent(
    app: AppHandle,
    project_root: String,
    agent_id: String,
) -> Result<(), String> {
    // Read state and update
    let mut state = read_swarm_state(&project_root).map_err(|e| e.to_string())?;

    // Update merge queue item
    for item in &mut state.merge_queue {
        if item.agent_id == agent_id {
            item.status = "merging".into();
        }
    }
    write_swarm_state(&project_root, &state).map_err(|e| e.to_string())?;

    emit_timeline(
        &state,
        &app,
        &agent_id,
        "merge_started",
        Some("Starting merge"),
        None,
    );

    // Execute merge
    git::merge_agent_branch(&project_root, &agent_id).map_err(|e| e.to_string())?;

    // Update state after merge
    let mut state = read_swarm_state(&project_root).map_err(|e| e.to_string())?;
    for item in &mut state.merge_queue {
        if item.agent_id == agent_id {
            item.status = "merged".into();
        }
    }
    if let Some(agent) = state.agents.get_mut(&agent_id) {
        agent.status = AgentStatus::Done;
    }
    // Mark task as completed
    if let Some(agent) = state.agents.get(&agent_id) {
        for task in &mut state.tasks {
            if task.id == agent.task_id {
                task.status = "completed".into();
            }
        }
    }
    write_swarm_state(&project_root, &state).map_err(|e| e.to_string())?;

    emit_timeline(
        &state,
        &app,
        &agent_id,
        "merge_completed",
        Some("Branch merged"),
        None,
    );

    Ok(())
}

// ── API Key Management ────────────────────────────────

#[tauri::command]
pub fn set_api_key(project_root: String, provider: String, key: String) -> Result<(), String> {
    keyring::set_api_key(&project_root, &provider, &key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_api_key(project_root: String, provider: String) -> Result<Option<String>, String> {
    keyring::get_api_key(&project_root, &provider).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_api_key(project_root: String, provider: String) -> Result<(), String> {
    keyring::delete_api_key(&project_root, &provider).map_err(|e| e.to_string())
}

// ── Config ────────────────────────────────────────────

#[tauri::command]
pub fn update_swarm_config(project_root: String, config: SwarmConfig) -> Result<(), String> {
    let mut state = read_swarm_state(&project_root).map_err(|e| e.to_string())?;
    state.config = config;
    write_swarm_state(&project_root, &state).map_err(|e| e.to_string())
}

// ── Reconciliation ────────────────────────────────────

#[tauri::command]
pub fn reconcile_swarm(
    app: AppHandle,
    project_root: String,
) -> Result<ReconciliationReport, String> {
    let mut report = ReconciliationReport {
        revived: vec![],
        dead: vec![],
        resumed_merges: vec![],
    };

    let state = match read_swarm_state(&project_root) {
        Ok(s) => s,
        Err(_) => return Ok(report), // No swarm state to reconcile
    };

    let mut dead_agents = Vec::new();

    for (id, agent) in &state.agents {
        if agent.status != AgentStatus::Running && agent.status != AgentStatus::Dead {
            continue;
        }

        let worktree_exists = git::worktree_exists(&project_root, id);

        if let Some(pid) = agent.pid {
            if pid > 0 && git::is_pid_alive(pid as u32) && worktree_exists {
                // Agent is still alive
                report.revived.push(id.clone());
            } else {
                // Agent is dead
                dead_agents.push(id.clone());
                report.dead.push(id.clone());
            }
        } else if !worktree_exists {
            dead_agents.push(id.clone());
            report.dead.push(id.clone());
        }
    }

    // Mark dead agents and release locks
    if !dead_agents.is_empty() {
        let mut state = read_swarm_state(&project_root).map_err(|e| e.to_string())?;
        for id in &dead_agents {
            if let Some(agent) = state.agents.get_mut(id) {
                agent.status = AgentStatus::Dead;
            }
            state.file_locks.retain(|_, lock| lock.locked_by != *id);
            emit_timeline(
                &state,
                &app,
                id,
                "agent_died",
                Some("Agent process died"),
                None,
            );
        }
        write_swarm_state(&project_root, &state).map_err(|e| e.to_string())?;
    }

    // Re-process merge queue for any agents with status "done"
    // (merge may have been interrupted)
    for item in &state.merge_queue {
        if item.status == "merging" || (item.status == "pending") {
            if let Some(agent) = state.agents.get(&item.agent_id) {
                if agent.status == AgentStatus::Done {
                    report.resumed_merges.push(item.agent_id.clone());
                }
            }
        }
    }

    // Re-attach FS watcher (called from setup)
    watcher::start_swarm_watcher(app.clone(), project_root);

    Ok(report)
}

// ── Helpers ───────────────────────────────────────────

fn generate_task_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let dur = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    let hash = dur.as_nanos();
    let chars: Vec<char> = "abcdefghijklmnopqrstuvwxyz0123456789".chars().collect();
    let mut id = String::with_capacity(6);
    let mut h = hash;
    for _ in 0..6 {
        id.push(chars[(h % 36) as usize]);
        h /= 36;
    }
    id
}
