export type Language =
  | "javascript"
  | "typescript"
  | "python"
  | "c"
  | "cpp"
  | "rust"
  | "go"
  | "java"
  | "unknown";

export type ProcessStatus = "running" | "stopped" | "exited" | "error";

export interface ExecutionProcess {
  id: string;
  language: Language;
  file: string;
  command: string;
  args: string[];
  cwd: string;
  status: ProcessStatus;
  startedAt: number;
  exitCode: number | null;
}

export interface RunRequest {
  file: string;
  cwd: string;
  language?: Language;
}

export interface Task {
  id: string;
  request: RunRequest;
  type: "run" | "restart";
  timestamp: number;
}

export interface OutputChunk {
  source: "stdout" | "stderr";
  text: string;
  processId: string;
}

export interface TerminalEvent {
  type: "data" | "exit" | "error" | "start";
  processId: string;
  payload: unknown;
}
