/// <reference lib="webworker" />

import {
  FLUSH_INTERVAL_MS,
  type FromWorker,
  type ToWorker,
} from "@/lib/terminal-worker";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let buffer: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const flush = () => {
  if (buffer.length === 0) return;
  const data = buffer.join("");
  buffer = [];
  flushTimer = null;
  const msg: FromWorker = { type: "output", data };
  ctx.postMessage(msg);
};

const scheduleFlush = () => {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(flush, FLUSH_INTERVAL_MS);
};

ctx.addEventListener("message", (event: MessageEvent<ToWorker>) => {
  const msg = event.data;
  if (!msg) return;
  switch (msg.type) {
    case "output":
      buffer.push(msg.data);
      scheduleFlush();
      return;
    case "shutdown":
      if (buffer.length > 0) flush();
      if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      return;
  }
});

export {};
