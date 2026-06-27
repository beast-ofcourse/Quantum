mod commands;

use std::sync::Mutex;
use tauri::Manager;

struct StartupPath(Mutex<Option<String>>);

#[tauri::command]
fn get_startup_path(state: tauri::State<'_, StartupPath>) -> Option<String> {
    state.0.lock().unwrap().take()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(commands::watch::WatcherState::new())
        .manage(commands::pty::PtySessionState::new())
        .invoke_handler(tauri::generate_handler![
            commands::fs::read_directory,
            commands::fs::read_file,
            commands::fs::write_file,
            commands::fs::create_file,
            commands::fs::create_directory,
            commands::fs::rename_entry,
            commands::fs::delete_entry,
            commands::fs::resolve_home,
            commands::fs::stat,
            commands::fs::path_exists,
            commands::fs::reveal_in_explorer,
            commands::fs::list_files,
            commands::watch::watch_directory,
            commands::watch::unwatch_directory,
            commands::watch::unwatch_all,
            commands::pty::spawn_pty,
            commands::pty::write_pty,
            commands::pty::resize_pty,
            commands::pty::kill_pty,
            commands::shell::detect_shells,
            commands::git::git_status,
            commands::git::git_diff,
            commands::git::git_show_file,
            commands::git::git_log,
            commands::git::git_branch_list,
            commands::git::git_branch_create,
            commands::git::git_branch_delete,
            commands::git::git_checkout,
            commands::git::git_add,
            commands::git::git_reset,
            commands::git::git_commit,
            commands::git::git_push,
            commands::git::git_pull,
            commands::git::git_fetch,
            commands::git::git_remote_list,
            commands::git::git_remote_add,
            commands::git::git_remote_remove,
            commands::git::git_stash_list,
            commands::git::git_stash_push,
            commands::git::git_stash_pop,
            commands::git::git_stash_drop,
            commands::git::git_blame,
            commands::git::git_submodule_status,
            commands::git::git_init,
            commands::git::git_config_get,
            commands::git::git_config_set,
            commands::git::git_is_repo,
            commands::git::git_diff_hunks,
            commands::git::git_stage_hunk,
            commands::git::git_unstage_hunk,
            commands::git::git_stage_lines,
            commands::git::git_log_graph,
            commands::git::git_commit_detail,
            commands::git::git_rebase_detect,
            commands::git::git_rebase_todo_list,
            commands::git::git_rebase_start,
            commands::git::git_rebase_edit_todo,
            commands::git::git_rebase_continue,
            commands::git::git_rebase_skip,
            commands::git::git_rebase_abort,
            commands::git::git_tag_list,
            commands::git::git_tag_create,
            commands::git::git_tag_delete,
            commands::git::git_tag_push,
            commands::git::git_cherry_pick,
            commands::git::git_cherry_pick_detect,
            commands::git::git_cherry_pick_continue,
            commands::git::git_cherry_pick_abort,
            commands::git::git_revert,
            commands::git::git_revert_detect,
            commands::git::git_revert_continue,
            commands::git::git_revert_abort,
            commands::git::git_branch_compare,
            commands::git::git_stash_show,
            commands::git::git_stash_apply,
            commands::git::git_stash_partial,
            commands::git::git_worktree_list,
            commands::git::git_worktree_add,
            commands::git::git_worktree_remove,
            commands::git::git_worktree_prune,
            commands::git::git_bisect_start,
            commands::git::git_bisect_state,
            commands::git::git_bisect_log,
            commands::git::git_bisect_reset,
            commands::git::git_merge,
            commands::git::git_merge_abort,
            commands::git::git_clone,
            commands::git::git_branch_rename,
            commands::git::git_branch_set_upstream,
            commands::search::search_in_files,
            commands::search::replace_in_files,
            commands::definitions::find_definitions,
            get_startup_path,
        ])
        .setup(|app| {
            // Read first CLI arg as startup path (from "Open in Quantum" context menu)
            let path = std::env::args().nth(1).map(|p| {
                let trimmed = p.trim_matches('"').to_string();
                if trimmed.is_empty() { p } else { trimmed }
            });
            app.manage(StartupPath(Mutex::new(path)));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
