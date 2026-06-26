// Tauri IPC commands for execution engine
// These map to Rust backend commands if needed for privileged operations

export const IPC_COMMANDS = {
  EXECUTE: "execute_file",
  KILL: "kill_process",
  LIST_PROCESSES: "list_processes",
  GET_EXIT_CODE: "get_exit_code",
} as const;

export type IpcCommand = (typeof IPC_COMMANDS)[keyof typeof IPC_COMMANDS];
