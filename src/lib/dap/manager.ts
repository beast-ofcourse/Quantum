import { DapTransport } from "./transport";
import { DapProtocolClient } from "./protocol";
import { useDebugStore } from "@/stores/debugStore";
import { pushDebugMessage } from "@/components/terminal/DebugConsolePanel";
import type { DebugConfiguration, Breakpoint, Source, Thread, StoppedReason } from "@/types/debug";

class DebugSessionInstance {
  public readonly id: string;
  public readonly config: DebugConfiguration;
  public transport: DapTransport;
  public client: DapProtocolClient;
  public stoppedThreadId: number | null = null;

  constructor(id: string, config: DebugConfiguration) {
    this.id = id;
    this.config = config;
    this.transport = new DapTransport();
    this.client = new DapProtocolClient();
    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.client.setSendHandler((msg) => this.transport.send(msg));
    this.client.setEventHandler((event, body) => {
      this.handleEvent(event, body);
    });
    this.transport.on({
      onMessage: (msg) => this.client.handleMessage(msg),
      onExit: (code) => {
        pushDebugMessage("dap", `Adapter exited with code ${code}`, "info");
        useDebugStore.getState().updateState(this.id, { status: "terminated" });
      },
      onError: (err) => {
        pushDebugMessage("dap", `Transport error: ${err.message}`, "error");
      },
    });
  }

  private handleEvent(event: string, body?: unknown): void {
    const store = useDebugStore.getState();
    switch (event) {
      case "initialized": {
        this.sendConfiguration().catch((err) => {
          pushDebugMessage("dap", `Configuration failed: ${err.message}`, "error");
        });
        break;
      }
      case "stopped": {
        const b = body as { reason: string; threadId?: number; allThreadsStopped?: boolean; description?: string; text?: string; hitBreakpointIds?: number[] };
        this.stoppedThreadId = b.threadId ?? null;
        const reason = b.reason as StoppedReason;
        store.updateState(this.id, { status: "paused", stoppedThreadId: this.stoppedThreadId ?? undefined });
        pushDebugMessage("dap", `Paused: ${reason}${b.description ? ` - ${b.description}` : ""}`, "info");
        void this.refreshStack();
        break;
      }
      case "continued": {
        this.stoppedThreadId = null;
        store.updateState(this.id, { status: "running", stoppedThreadId: undefined });
        store.setCallStack([]);
        store.setScopes([]);
        break;
      }
      case "thread": {
        const b = body as { threads: Thread[] };
        store.updateState(this.id, { threads: b.threads });
        break;
      }
      case "output": {
        const b = body as { category?: string; output: string; source?: Source; line?: number; column?: number };
        if (b.output) {
          pushDebugMessage("dap", b.output.replace(/\r?\n$/, ""), b.category === "stderr" ? "error" : b.category === "console" ? "info" : "debug");
        }
        break;
      }
      case "breakpoint": {
        const b = body as { reason: "changed" | "new" | "removed"; breakpoint: Breakpoint };
        pushDebugMessage("dap", `Breakpoint ${b.reason}: line ${b.breakpoint.line}`, "debug");
        break;
      }
      case "process": {
        const b = body as { name?: string; systemProcessId?: number; isLocalProcess?: boolean; startMethod?: string };
        store.updateState(this.id, { processId: b.systemProcessId });
        pushDebugMessage("dap", `Process started: ${b.name ?? "unknown"} (pid: ${b.systemProcessId})`, "info");
        break;
      }
      case "terminated": {
        const b = body as { restart?: boolean };
        if (!b?.restart) {
          store.updateState(this.id, { status: "terminated" });
          pushDebugMessage("dap", "Session terminated", "info");
        }
        break;
      }
      case "exited": {
        const b = body as { exitCode?: number };
        store.updateState(this.id, { status: "terminated" });
        pushDebugMessage("dap", `Process exited with code ${b.exitCode ?? "unknown"}`, "info");
        break;
      }
      case "capabilities": {
        pushDebugMessage("dap", "Adapter capabilities received", "debug");
        break;
      }
      case "module": {
        break;
      }
    }
  }

  private async sendConfiguration(): Promise<void> {
    const store = useDebugStore.getState();
    const config = this.config;

    if (config.request === "launch") {
      await this.client.launch({
        program: config.program,
        args: config.args,
        cwd: config.cwd,
        env: config.env,
        stopOnEntry: config.stopOnEntry,
        runtime: config.runtime,
        runtimeArgs: config.runtimeArgs,
        ...config.debugOptions,
      } as Record<string, unknown>);
    } else {
      await this.client.attach({
        program: config.program,
        port: config.port,
        host: config.host,
        ...config.debugOptions,
      } as Record<string, unknown>);
    }

    const breakpoints = Array.from(store.breakpoints.entries());
    for (const [filePath, bps] of breakpoints) {
      const enabled = bps.filter((bp) => bp.enabled);
      if (enabled.length > 0) {
        const source: Source = { path: filePath };
        await this.client.setBreakpoints(
          enabled.map((bp) => ({ line: bp.line })),
          source,
        );
      }
    }

    const exceptionBps = store.exceptionBreakpoints;
    if (exceptionBps.length > 0) {
      await this.client.setExceptionBreakpoints(exceptionBps);
    }

    await this.client.configurationDone();
    store.updateState(this.id, { status: "running" });
    pushDebugMessage("dap", "Configuration done, running", "info");
  }

  private async refreshStack(): Promise<void> {
    if (this.stoppedThreadId == null) return;
    const store = useDebugStore.getState();
    try {
      const { stackFrames } = await this.client.stackTrace(this.stoppedThreadId!);
      store.setCallStack(stackFrames);
      if (stackFrames.length > 0) {
        const scopes = await this.client.scopes(stackFrames[0].id);
        store.setScopes(scopes);
      } else {
        store.setScopes([]);
      }
    } catch (err) {
      pushDebugMessage("dap", `Failed to get stack: ${err instanceof Error ? err.message : String(err)}`, "error");
    }
  }

  async continue_(): Promise<void> {
    if (this.stoppedThreadId == null) return;
    await this.client.continue_(this.stoppedThreadId);
    useDebugStore.getState().updateState(this.id, { status: "running" });
  }

  async stepOver(): Promise<void> {
    if (this.stoppedThreadId == null) return;
    await this.client.next(this.stoppedThreadId);
    useDebugStore.getState().updateState(this.id, { status: "stepping" });
  }

  async stepInto(): Promise<void> {
    if (this.stoppedThreadId == null) return;
    await this.client.stepIn(this.stoppedThreadId);
    useDebugStore.getState().updateState(this.id, { status: "stepping" });
  }

  async stepOut(): Promise<void> {
    if (this.stoppedThreadId == null) return;
    await this.client.stepOut(this.stoppedThreadId);
    useDebugStore.getState().updateState(this.id, { status: "stepping" });
  }

  async pause(): Promise<void> {
    if (this.stoppedThreadId == null) {
      const store = useDebugStore.getState();
      const session = store.sessions.find((s) => s.id === this.id);
      if (session && session.threads.length > 0) {
        await this.client.pause(session.threads[0].id);
      }
    }
  }

  async evaluate(expression: string, frameId?: number): Promise<{ result: string; type?: string; variablesReference: number }> {
    return this.client.evaluate(expression, frameId, "repl");
  }

  async loadVariables(variablesReference: number): Promise<void> {
    const store = useDebugStore.getState();
    try {
      const vars = await this.client.variables(variablesReference);
      store.setVariables(variablesReference, vars);
    } catch (err) {
      pushDebugMessage("dap", `Failed to load variables: ${err instanceof Error ? err.message : String(err)}`, "error");
    }
  }

  async setVariableValue(variablesReference: number, name: string, value: string): Promise<void> {
    try {
      await this.client.setVariable(variablesReference, name, value);
    } catch (err) {
      pushDebugMessage("dap", `Failed to set variable: ${err instanceof Error ? err.message : String(err)}", "error`);
    }
  }

  async stop(): Promise<void> {
    try {
      const caps = this.client.getCapabilities();
      if (caps.supportsTerminateRequest) {
        await this.client.terminate();
      } else {
        await this.client.disconnect();
      }
    } catch {
      /* ignore */
    }
    this.transport.kill();
    useDebugStore.getState().updateState(this.id, { status: "terminated" });
  }
}

class DapManager {
  private sessions = new Map<string, DebugSessionInstance>();

  async startDebugging(config: DebugConfiguration): Promise<string> {
    const store = useDebugStore.getState();
    const id = `debug-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const session: import("@/types/debug").DebugSession = {
      id,
      type: config.type,
      name: config.name,
      status: "running",
      config,
      threads: [],
      startedAt: Date.now(),
    };
    store.addSession(session);

    pushDebugMessage("dap", `Starting debug session: ${config.name} (${config.type})`, "info");

    const instance = new DebugSessionInstance(id, config);
    this.sessions.set(id, instance);

    try {
      await instance.transport.start(config.adapterPath, config.adapterArgs);
    } catch (err) {
      pushDebugMessage("dap", `Failed to start adapter: ${err instanceof Error ? err.message : String(err)}`, "error");
      store.updateState(id, { status: "terminated" });
      throw err;
    }

    try {
      await instance.client.initialize(config.type);
      store.updateState(id, { status: "running" });
    } catch (err) {
      pushDebugMessage("dap", `Failed to initialize adapter: ${err instanceof Error ? err.message : String(err)}`, "error");
      await this.stopDebugging(id);
      throw err;
    }

    return id;
  }

  getInstance(id: string): DebugSessionInstance | undefined {
    return this.sessions.get(id);
  }

  getActiveInstance(): DebugSessionInstance | undefined {
    const store = useDebugStore.getState();
    const activeId = store.activeSessionId;
    if (!activeId) return undefined;
    return this.sessions.get(activeId);
  }

  async stopDebugging(id: string): Promise<void> {
    const instance = this.sessions.get(id);
    if (instance) {
      await instance.stop();
      this.sessions.delete(id);
    }
    const store = useDebugStore.getState();
    store.clearSession(id);
  }

  async stopAll(): Promise<void> {
    const ids = Array.from(this.sessions.keys());
    await Promise.all(ids.map((id) => this.stopDebugging(id)));
  }
}

export const dapManager = new DapManager();
export type { DebugSessionInstance };
