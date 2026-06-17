export type DebugStatus = "inactive" | "running" | "paused" | "stepping" | "stopped" | "terminated";

export interface Source {
  name?: string;
  path?: string;
  sourceReference?: number;
  presentationHint?: string;
  origin?: string;
  sources?: Source[];
  adapterData?: unknown;
  checksums?: { algorithm: string; checksum: string }[];
}

export interface Breakpoint {
  id: number;
  verified: boolean;
  enabled: boolean;
  line: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  message?: string;
  source?: Source;
  instructionReference?: string;
  offset?: number;
}

export interface Thread {
  id: number;
  name: string;
}

export interface StackFrame {
  id: number;
  name: string;
  source?: Source;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  canRestart?: boolean;
  instructionPointerReference?: string;
  moduleId?: number;
  presentationHint?: "normal" | "label" | "subtle";
}

export interface Scope {
  name: string;
  presentationHint?: "arguments" | "locals" | "registers";
  variablesReference: number;
  namedVariables?: number;
  indexedVariables?: number;
  expensive: boolean;
  source?: Source;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
}

export interface Variable {
  name: string;
  value: string;
  type?: string;
  presentationHint?: {
    kind?: "property" | "method" | "class" | "data" | "event" | "baseClass" | "innerClass" | "interface" | "mostDerivedClass" | "virtual";
    visibility?: "public" | "protected" | "private" | "internal" | "final";
    lazy?: boolean;
  };
  evaluateName?: string;
  variablesReference: number;
  namedVariables?: number;
  indexedVariables?: number;
  memoryReference?: string;
}

export interface DebugSession {
  id: string;
  type: string;
  name: string;
  status: DebugStatus;
  config: DebugConfiguration;
  threads: Thread[];
  stoppedThreadId?: number;
  processId?: number;
  startedAt: number;
}

export interface DebugConfiguration {
  type: string;
  name: string;
  request: "launch" | "attach";
  program?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  stopOnEntry?: boolean;
  adapterPath: string;
  adapterArgs: string[];
  runtime?: string;
  runtimeArgs?: string[];
  port?: number;
  host?: string;
  sourceMaps?: boolean;
  debugOptions?: Record<string, unknown>;
}

export interface ExceptionBreakpointsFilter {
  filter: string;
  label: string;
  default?: boolean;
}

export interface ExceptionInfo {
  exceptionId: string;
  description?: string;
  breakMode: "never" | "always" | "unhandled" | "userUnhandled";
  details?: {
    message?: string;
    typeName?: string;
    fullTypeName?: string;
    evaluateName?: string;
    stackTrace?: string;
    innerException?: ExceptionInfo[];
  };
}

export interface DebugAdapterCapabilities {
  supportsConfigurationDoneRequest?: boolean;
  supportsFunctionBreakpoints?: boolean;
  supportsConditionalBreakpoints?: boolean;
  supportsHitConditionalBreakpoints?: boolean;
  supportsEvaluateForHovers?: boolean;
  exceptionBreakpointFilters?: ExceptionBreakpointsFilter[];
  supportsStepBack?: boolean;
  supportsSetVariable?: boolean;
  supportsRestartRequest?: boolean;
  supportsExceptionOptions?: boolean;
  supportsTerminateRequest?: boolean;
  supportsExceptionInfoRequest?: boolean;
  supportsDelayedStackTraceLoading?: boolean;
  supportsLoadedSourcesRequest?: boolean;
  supportsLogPoints?: boolean;
  supportsTerminateThreadsRequest?: boolean;
  supportsSetExpression?: boolean;
  supportsTerminateDebuggee?: boolean;
  supportsDataBreakpoints?: boolean;
  supportsReadMemoryRequest?: boolean;
  supportsWriteMemoryRequest?: boolean;
  supportsDisassembleRequest?: boolean;
  supportsCancelRequest?: boolean;
  supportsBreakpointLocationsRequest?: boolean;
  supportsClipboardContext?: boolean;
  supportsSteppingGranularity?: boolean;
  supportsInstructionBreakpoints?: boolean;
  supportsExceptionFilterOptions?: boolean;
  supportsSingleThreadExecutionRequests?: boolean;
}

export interface WatchExpression {
  id: string;
  expression: string;
  value?: string;
  type?: string;
  error?: string;
  variablesReference: number;
}

export type DapEvent =
  | "initialized"
  | "stopped"
  | "continued"
  | "exited"
  | "terminated"
  | "thread"
  | "output"
  | "breakpoint"
  | "module"
  | "loadedSource"
  | "progressStart"
  | "progressUpdate"
  | "progressEnd"
  | "capabilities"
  | "process"
  | "memory";

export type StoppedReason =
  | "step"
  | "breakpoint"
  | "exception"
  | "pause"
  | "entry"
  | "goto"
  | "function breakpoint"
  | "data breakpoint"
  | "instruction breakpoint"
  | "exception breakpoint";
