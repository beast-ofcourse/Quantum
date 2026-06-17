export type ToWorker =
  | { type: "output"; data: string }
  | { type: "shutdown" };

export type FromWorker = { type: "output"; data: string };

export const FLUSH_INTERVAL_MS = 16;
