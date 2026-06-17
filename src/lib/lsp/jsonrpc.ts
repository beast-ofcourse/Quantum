import type { JsonRpcMessage } from "./types";

const encoder = new TextEncoder();

export function encodeMessage(msg: JsonRpcMessage): string {
  const body = JSON.stringify(msg);
  const bytes = encoder.encode(body);
  return `Content-Length: ${bytes.length}\r\n\r\n${body}`;
}

let requestId = 0;

export function createRequest(method: string, params?: unknown): JsonRpcMessage & { id: number } {
  return { id: ++requestId, method, params };
}

export function createNotification(method: string, params?: unknown): JsonRpcMessage {
  return { method, params };
}

export function createResponse(id: number, result?: unknown): JsonRpcMessage {
  return { id, result };
}

export class MessageBuffer {
  private buffer = "";
  private contentLength = -1;

  push(data: string): JsonRpcMessage[] {
    this.buffer += data;
    const messages: JsonRpcMessage[] = [];
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
