export interface Shell {
  id: string;
  label: string;
  path: string;
  args: string[];
  isDefault?: boolean;
}

export interface TerminalSession {
  id: string;
  shellId: string;
  shellLabel: string;
  pid: number;
  cwd: string;
  createdAt: number;
  title?: string;
}

export interface PtyExitPayload {
  code: number | null;
  signal: number | null;
}
