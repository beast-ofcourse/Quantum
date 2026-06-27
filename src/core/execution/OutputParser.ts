import type { OutputChunk } from "./types";

export type OutputSegment = {
  text: string;
  style: "normal" | "error" | "warn" | "info";
};

const ERROR_PATTERNS = [
  /error/i,
  /exception/i,
  /traceback/i,
  /failed/i,
  /SyntaxError/i,
  /TypeError/i,
  /ReferenceError/i,
];

const WARN_PATTERNS = [
  /warning/i,
  /deprecated/i,
];

export function parseOutput(chunk: OutputChunk): OutputSegment[] {
  const segments: OutputSegment[] = [];
  let style: OutputSegment["style"] = "normal";

  if (chunk.source === "stderr") {
    style = "error";
  } else if (ERROR_PATTERNS.some((p) => p.test(chunk.text))) {
    style = "error";
  } else if (WARN_PATTERNS.some((p) => p.test(chunk.text))) {
    style = "warn";
  }

  segments.push({ text: chunk.text, style });
  return segments;
}
