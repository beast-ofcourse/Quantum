export type FileEncoding = "utf-8" | "utf-16le" | "utf-16be" | "latin-1" | "ascii";

const BOM_MARKS: [Uint8Array, FileEncoding][] = [
  [new Uint8Array([0xEF, 0xBB, 0xBF]), "utf-8"],
  [new Uint8Array([0xFF, 0xFE]), "utf-16le"],
  [new Uint8Array([0xFE, 0xFF]), "utf-16be"],
];

function matchBom(data: Uint8Array): FileEncoding | null {
  for (const [bom, enc] of BOM_MARKS) {
    if (data.length >= bom.length && bom.every((b, i) => data[i] === b)) {
      return enc;
    }
  }
  return null;
}

function isAscii(data: Uint8Array): boolean {
  for (let i = 0; i < data.length; i++) {
    if (data[i] > 0x7f) return false;
  }
  return true;
}

function isValidUtf8(data: Uint8Array): boolean {
  let i = 0;
  while (i < data.length) {
    if (data[i] <= 0x7f) { i++; continue; }
    if (data[i] >= 0xc2 && data[i] <= 0xdf && i + 1 < data.length && data[i + 1] >= 0x80 && data[i + 1] <= 0xbf) { i += 2; continue; }
    if (data[i] >= 0xe0 && data[i] <= 0xef && i + 2 < data.length && data[i + 1] >= 0x80 && data[i + 1] <= 0xbf && data[i + 2] >= 0x80 && data[i + 2] <= 0xbf) {
      if (data[i] === 0xe0 && data[i + 1] < 0xa0) return false;
      i += 3; continue;
    }
    if (data[i] >= 0xf0 && data[i] <= 0xf4 && i + 3 < data.length && data[i + 1] >= 0x80 && data[i + 1] <= 0xbf && data[i + 2] >= 0x80 && data[i + 2] <= 0xbf && data[i + 3] >= 0x80 && data[i + 3] <= 0xbf) {
      if (data[i] === 0xf0 && data[i + 1] < 0x90) return false;
      if (data[i] === 0xf4 && data[i + 1] > 0x8f) return false;
      i += 4; continue;
    }
    return false;
  }
  return true;
}

export function detectEncoding(data: ArrayBuffer | Uint8Array): FileEncoding {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length === 0) return "utf-8";
  const bom = matchBom(bytes);
  if (bom) return bom;
  if (isAscii(bytes)) return "ascii";
  if (isValidUtf8(bytes)) return "utf-8";
  return "latin-1";
}

export interface DecodeResult {
  text: string;
  encoding: FileEncoding;
}

export function decodeContent(data: ArrayBuffer | Uint8Array, encoding?: string): DecodeResult {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const detected = (encoding as FileEncoding) || detectEncoding(bytes);
  try {
    const bomLength = (() => {
      for (const [bom] of BOM_MARKS) {
        if (bytes.length >= bom.length && bom.every((b, i) => bytes[i] === b)) {
          return bom.length;
        }
      }
      return 0;
    })();
    const decoder = new TextDecoder(detected, { fatal: false });
    const text = decoder.decode(bytes.slice(bomLength));
    return { text, encoding: detected };
  } catch {
    const decoder = new TextDecoder("utf-8", { fatal: false });
    return { text: decoder.decode(bytes), encoding: "utf-8" };
  }
}
