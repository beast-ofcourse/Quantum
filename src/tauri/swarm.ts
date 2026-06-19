import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  ManifestChangedPayload,
  MergeCheckResult,
  ReconciliationReport,
  SwarmConfig,
  SwarmState,
  TaskSpec,
} from "@/types/swarm";
import { useSwarmStore } from "@/stores/swarmStore";
import { coordinationService } from "@/lib/swarm/coordinationService";

export async function initSwarm(
  projectRoot: string,
  name: string,
): Promise<SwarmState> {
  return invoke<SwarmState>("init_swarm", { projectRoot, name });
}

export async function addAgent(
  projectRoot: string,
  task: TaskSpec,
): Promise<string> {
  return invoke<string>("add_agent", { projectRoot, task });
}

export async function spawnAgentPty(
  projectRoot: string,
  agentId: string,
): Promise<number> {
  return invoke<number>("spawn_agent_pty", { projectRoot, agentId });
}

export async function killAgent(
  projectRoot: string,
  agentId: string,
): Promise<void> {
  await invoke("kill_agent", { projectRoot, agentId });
}

export async function getSwarmState(
  projectRoot: string,
): Promise<SwarmState> {
  return invoke<SwarmState>("get_swarm_state", { projectRoot });
}

export async function checkMerge(
  projectRoot: string,
  agentId: string,
): Promise<MergeCheckResult> {
  return invoke<MergeCheckResult>("check_merge", { projectRoot, agentId });
}

export async function mergeAgent(
  projectRoot: string,
  agentId: string,
): Promise<void> {
  await invoke("merge_agent", { projectRoot, agentId });
}

export async function setApiKey(
  projectRoot: string,
  provider: string,
  key: string,
): Promise<void> {
  await invoke("set_api_key", { projectRoot, provider, key });
}

export async function getApiKey(
  projectRoot: string,
  provider: string,
): Promise<string | null> {
  return invoke<string | null>("get_api_key", { projectRoot, provider });
}

export async function deleteApiKey(
  projectRoot: string,
  provider: string,
): Promise<void> {
  await invoke("delete_api_key", { projectRoot, provider });
}

export async function reconcileSwarm(
  projectRoot: string,
): Promise<ReconciliationReport> {
  return invoke<ReconciliationReport>("reconcile_swarm", { projectRoot });
}

export async function updateSwarmConfig(
  projectRoot: string,
  config: SwarmConfig,
): Promise<void> {
  await invoke("update_swarm_config", { projectRoot, config });
}

export async function writeAgentContext(
  projectRoot: string,
  agentId: string,
  content: string,
): Promise<void> {
  await invoke("write_agent_context", { projectRoot, agentId, content });
}

export async function isPidAlive(pid: number): Promise<boolean> {
  return invoke<boolean>("is_pid_alive", { pid });
}

export async function checkSwarmStateFile(
  projectRoot: string,
): Promise<string | null> {
  return invoke<string | null>("check_swarm_state_file", { projectRoot });
}

export async function recreateQuantumDir(
  projectRoot: string,
): Promise<void> {
  await invoke("create_dir_all", { path: `${projectRoot}/.quantum` });
}

export async function startSwarmEventListeners(
  projectRoot: string,
): Promise<UnlistenFn[]> {
  const store = useSwarmStore.getState();
  const unlisteners: UnlistenFn[] = [];

  // Load initial state — if parse fails, error is set in store
  try {
    const state = await getSwarmState(projectRoot);
    store.setState(state);
  } catch (err) {
    store.setState({
      ...(store.state ?? {
        version: 1, swarmId: "", name: "", createdAt: new Date().toISOString(), phase: "planning" as const,
        config: { defaultAgent: "opencode", defaultModel: "deepseek-v4-flash-free", quickPresets: [], modelOptions: {} },
        agents: {}, tasks: [], fileLocks: {}, mergeQueue: [],
      }),
    });
    store.appendTimelineEvent({
      t: new Date().toISOString(),
      agent: "system",
      type: "error",
      detail: `Failed to load swarm state: ${err}`,
    });
  }

  // Run reconciliation after loading state
  try {
    const report = await reconcileSwarm(projectRoot);
    if (report.revived.length > 0 || report.dead.length > 0) {
      const store = useSwarmStore.getState();
      if (store.state) {
        // Re-read state after reconciliation
        const freshState = await getSwarmState(projectRoot);
        store.setState(freshState);
      }
      store.appendTimelineEvent({
        t: new Date().toISOString(),
        agent: "system",
        type: "reconciliation",
        detail: `Revived: ${report.revived.length}, Dead: ${report.dead.length}, Resumed merges: ${report.resumedMerges.length}`,
      });
    }
  } catch (err) {
    console.warn("[swarm] reconciliation failed:", err);
  }

  // Initialize coordination service
  coordinationService.init(projectRoot);

  unlisteners.push(
    await listen<ManifestChangedPayload>(
      "swarm:manifest-changed",
      (event) => {
        coordinationService.onManifestChanged(
          event.payload.agentId,
          event.payload.manifest,
        );
      },
    ),
  );

  unlisteners.push(
    await listen<string>("swarm:manifest-parse-error", (event) => {
      store.markManifestError(event.payload);
    }),
  );

  unlisteners.push(
    await listen<ReconciliationReport>(
      "swarm:reconciliation",
      (event) => {
        store.appendTimelineEvent({
          t: new Date().toISOString(),
          agent: "system",
          type: "reconciliation",
          detail: `Revived: ${event.payload.revived.length}, Dead: ${event.payload.dead.length}`,
        });
      },
    ),
  );

  return unlisteners;
}
