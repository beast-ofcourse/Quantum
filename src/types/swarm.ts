export type AgentType = "opencode" | "kilocode";

export type AgentStatus =
  | "idle" | "running" | "waiting" | "merging"
  | "done" | "failed" | "dead";

export type SwarmPhase =
  | "planning" | "executing" | "merging"
  | "conflict" | "done";

export interface AgentManifest {
  status: string;
  currentThought?: string;
  filesModified?: string[];
  error?: string | null;
  _parseError?: boolean;
}

export interface AgentInfo {
  id: string;
  type: AgentType;
  model: string;
  taskId: string;
  status: AgentStatus;
  pid: number | null;
  sessionId: string | null;
  worktreePath: string;
  branch: string;
  dependsOn: string[];
  heartbeatAt: string | null;
  exitCode: number | null;
  manifest: AgentManifest;
}

export interface Task {
  id: string;
  description: string;
  status: string;
  assignedTo: string | null;
  dependsOn: string[];
  priority: number;
}

export interface FileLock {
  lockedBy: string;
  lockedAt: string;
}

export interface MergeQueueItem {
  agentId: string;
  branch: string;
  taskId: string;
  status: string;
}

export interface QuickPreset {
  agent: string;
  model: string;
  label: string;
}

export interface SwarmConfig {
  defaultAgent: string;
  defaultModel: string;
  quickPresets: QuickPreset[];
  modelOptions: Record<string, string[]>;
}

export interface SwarmState {
  version: number;
  swarmId: string;
  name: string;
  createdAt: string;
  phase: SwarmPhase;
  config: SwarmConfig;
  agents: Record<string, AgentInfo>;
  tasks: Task[];
  fileLocks: Record<string, FileLock>;
  mergeQueue: MergeQueueItem[];
}

export interface TaskSpec {
  description: string;
  agentType: string;
  model: string;
  dependsOn: string[];
}

export interface ManifestChangedPayload {
  agentId: string;
  manifest: AgentManifest;
}

export interface ReconciliationReport {
  revived: string[];
  dead: string[];
  resumedMerges: string[];
}

export interface MergeCheckResult {
  hasConflict: boolean;
  conflictFiles: string[];
}

export interface TimelineEvent {
  t: string;
  agent: string;
  type: string;
  detail?: string;
  file?: string;
}

export interface SwarmTimelineState {
  timeline: TimelineEvent[];
}
