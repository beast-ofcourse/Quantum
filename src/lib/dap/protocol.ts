import type { DebugAdapterCapabilities, Source, Breakpoint, Thread, StackFrame, Scope, Variable } from "@/types/debug";

export interface DapRequest {
  seq: number;
  type: "request";
  command: string;
  arguments?: unknown;
}

export interface DapResponse {
  seq: number;
  type: "response";
  request_seq: number;
  command: string;
  success: boolean;
  message?: string;
  body?: unknown;
}

export interface DapEventMsg {
  seq: number;
  type: "event";
  event: string;
  body?: unknown;
}

export type DapMessage = DapRequest | DapResponse | DapEventMsg;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const REQUEST_TIMEOUT = 30000;
let seqCounter = 0;

const encoder = new TextEncoder();

export function encodeDapMessage(msg: DapMessage): string {
  const body = JSON.stringify(msg);
  const bytes = encoder.encode(body);
  return `Content-Length: ${bytes.length}\r\n\r\n${body}`;
}

export class DapMessageBuffer {
  private buffer = "";
  private contentLength = -1;

  push(data: string): DapMessage[] {
    this.buffer += data;
    const messages: DapMessage[] = [];
    while (true) {
      if (this.contentLength === -1) {
        const idx = this.buffer.indexOf("\r\n\r\n");
        if (idx === -1) break;
        const header = this.buffer.slice(0, idx);
        const match = header.match(/Content-Length:\s*(\d+)/i);
        if (!match) {
          this.buffer = this.buffer.slice(idx + 4);
          continue;
        }
        this.contentLength = parseInt(match[1], 10);
        this.buffer = this.buffer.slice(idx + 4);
      }
      const rawBytes = encoder.encode(this.buffer.slice(0, this.contentLength));
      if (rawBytes.length < this.contentLength) break;
      const body = this.buffer.slice(0, this.contentLength);
      this.buffer = this.buffer.slice(this.contentLength);
      this.contentLength = -1;
      try {
        messages.push(JSON.parse(body));
      } catch {
        /* skip malformed */
      }
    }
    return messages;
  }
}

export class DapProtocolClient {
  private pending = new Map<number, PendingRequest>();
  private capabilities: DebugAdapterCapabilities = {};
  private onEvent: ((event: string, body?: unknown) => void) | null = null;
  private sendRaw: ((msg: DapMessage) => void) | null = null;

  setSendHandler(handler: (msg: DapMessage) => void): void {
    this.sendRaw = handler;
  }

  setEventHandler(handler: (event: string, body?: unknown) => void): void {
    this.onEvent = handler;
  }

  getCapabilities(): DebugAdapterCapabilities {
    return this.capabilities;
  }

  handleMessage(msg: DapMessage): void {
    if (msg.type === "response") {
      const resp = msg as DapResponse;
      const pending = this.pending.get(resp.request_seq);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(resp.request_seq);
        if (resp.success) {
          pending.resolve(resp.body);
        } else {
          pending.reject(new Error(resp.message ?? "DAP request failed"));
        }
      }
    } else if (msg.type === "event") {
      const evt = msg as DapEventMsg;
      if (evt.event === "capabilities" && evt.body) {
        this.capabilities = evt.body as DebugAdapterCapabilities;
      }
      this.onEvent?.(evt.event, evt.body);
    }
  }

  sendRequest(command: string, args?: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const seq = ++seqCounter;
      const req: DapRequest = { seq, type: "request", command, arguments: args };
      const timer = setTimeout(() => {
        this.pending.delete(seq);
        reject(new Error(`DAP request timed out: ${command}`));
      }, REQUEST_TIMEOUT);
      this.pending.set(seq, { resolve, reject, timer });
      this.sendRaw?.(req);
    });
  }

  async initialize(adapterId: string): Promise<DebugAdapterCapabilities> {
    const result = await this.sendRequest("initialize", {
      clientID: "quantum",
      clientName: "Quantum Code Editor",
      adapterID: adapterId,
      pathFormat: "path",
      linesStartAt1: true,
      columnsStartAt1: true,
      supportsVariableType: true,
      supportsVariablePaging: true,
      supportsRunInTerminalRequest: true,
      locale: "en-US",
    }) as { capabilities?: DebugAdapterCapabilities };
    if (result?.capabilities) {
      this.capabilities = result.capabilities as DebugAdapterCapabilities;
    }
    return this.capabilities;
  }

  async launch(args: Record<string, unknown>): Promise<void> {
    await this.sendRequest("launch", { ...args, noDebug: false });
  }

  async attach(args: Record<string, unknown>): Promise<void> {
    await this.sendRequest("attach", args);
  }

  async configurationDone(): Promise<void> {
    await this.sendRequest("configurationDone");
  }

  async setBreakpoints(breakpoints: { line: number; condition?: string; hitCondition?: string }[], source: Source): Promise<Breakpoint[]> {
    const result = await this.sendRequest("setBreakpoints", {
      source,
      breakpoints,
      sourceModified: false,
    }) as { breakpoints: Breakpoint[] };
    return (result?.breakpoints ?? []) as Breakpoint[];
  }

  async setExceptionBreakpoints(filters: string[]): Promise<void> {
    await this.sendRequest("setExceptionBreakpoints", { filters });
  }

  async continue_(threadId: number): Promise<{ allThreadsContinued?: boolean }> {
    return this.sendRequest("continue", { threadId }) as Promise<{ allThreadsContinued?: boolean }>;
  }

  async next(threadId: number): Promise<void> {
    await this.sendRequest("next", { threadId });
  }

  async stepIn(threadId: number): Promise<void> {
    await this.sendRequest("stepIn", { threadId });
  }

  async stepOut(threadId: number): Promise<void> {
    await this.sendRequest("stepOut", { threadId });
  }

  async pause(threadId: number): Promise<void> {
    await this.sendRequest("pause", { threadId });
  }

  async stackTrace(threadId: number, startFrame?: number, levels?: number): Promise<{ stackFrames: StackFrame[]; totalFrames?: number }> {
    const result = await this.sendRequest("stackTrace", { threadId, startFrame, levels }) as { stackFrames: StackFrame[]; totalFrames?: number };
    return { stackFrames: (result?.stackFrames ?? []) as StackFrame[], totalFrames: result?.totalFrames };
  }

  async scopes(frameId: number): Promise<Scope[]> {
    const result = await this.sendRequest("scopes", { frameId }) as { scopes: Scope[] };
    return (result?.scopes ?? []) as Scope[];
  }

  async variables(variablesReference: number, start?: number, count?: number): Promise<Variable[]> {
    const result = await this.sendRequest("variables", { variablesReference, start, count }) as { variables: Variable[] };
    return (result?.variables ?? []) as Variable[];
  }

  async evaluate(expression: string, frameId?: number, context?: "watch" | "repl" | "hover" | "clipboard"): Promise<{ result: string; type?: string; variablesReference: number }> {
    return this.sendRequest("evaluate", { expression, frameId, context }) as Promise<{ result: string; type?: string; variablesReference: number }>;
  }

  async setVariable(variablesReference: number, name: string, value: string): Promise<{ value: string; type?: string; variablesReference: number }> {
    return this.sendRequest("setVariable", { variablesReference, name, value }) as Promise<{ value: string; type?: string; variablesReference: number }>;
  }

  async setExpression(expression: string, value: string, frameId?: number): Promise<{ result: string; type?: string }> {
    return this.sendRequest("setExpression", { expression, value, frameId }) as Promise<{ result: string; type?: string }>;
  }

  async threads(): Promise<Thread[]> {
    const result = await this.sendRequest("threads") as { threads: Thread[] };
    return (result?.threads ?? []) as Thread[];
  }

  async exceptionInfo(threadId: number): Promise<{ exceptionId: string; description?: string; breakMode: string; details?: unknown }> {
    return this.sendRequest("exceptionInfo", { threadId }) as Promise<{ exceptionId: string; description?: string; breakMode: string; details?: unknown }>;
  }

  async disconnect(terminateDebuggee?: boolean): Promise<void> {
    try {
      await this.sendRequest("disconnect", { terminateDebuggee, restart: false });
    } catch {
      /* adapter may have already exited */
    }
  }

  async terminate(restart?: boolean): Promise<void> {
    try {
      await this.sendRequest("terminate", { restart });
    } catch {
      /* adapter may have already exited */
    }
  }

  cancelAll(): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Session cancelled"));
      this.pending.delete(id);
    }
  }
}
