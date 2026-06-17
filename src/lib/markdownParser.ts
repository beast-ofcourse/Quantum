export interface TocEntry {
  id: string;
  text: string;
  level: number;
}

export interface ParseResult {
  html: string;
  toc: TocEntry[];
}

export type ParsedMarkdown = ParseResult;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "heading";
}

function makeId(seen: Map<string, number>, base: string): string {
  const key = base || "heading";
  const count = seen.get(key) ?? 0;
  seen.set(key, count + 1);
  return count === 0 ? key : `${key}-${count}`;
}

function processInline(text: string): string {
  let result = "";
  let i = 0;

  while (i < text.length) {
    if (text.startsWith("\\", i) && i + 1 < text.length) {
      const next = text[i + 1];
      if ("\\`*_{}[]()#+-.!|<>~".includes(next)) {
        result += next;
        i += 2;
        continue;
      }
      result += "\\";
      i += 1;
      continue;
    }

    if (text.startsWith("![")) {
      const close = text.indexOf("](", i + 2);
      if (close !== -1) {
        const alt = text.slice(i + 2, close);
        const urlEnd = text.indexOf(")", close + 2);
        if (urlEnd !== -1) {
          const url = text.slice(close + 2, urlEnd);
          result += `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy" />`;
          i = urlEnd + 1;
          continue;
        }
      }
    }

    if (text.startsWith("[", i)) {
      const close = text.indexOf("](", i + 1);
      if (close !== -1) {
        const linkText = text.slice(i + 1, close);
        const urlEnd = text.indexOf(")", close + 2);
        if (urlEnd !== -1) {
          let url = text.slice(close + 2, urlEnd);
          const titleMatch = url.match(/\s+"([^"]*)"$/);
          let title = "";
          if (titleMatch) {
            title = titleMatch[1];
            url = url.slice(0, titleMatch.index);
          }
          result += `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"${title ? ` title="${escapeHtml(title)}"` : ""}>${processInline(linkText)}</a>`;
          i = urlEnd + 1;
          continue;
        }
      }
    }

    if (text.startsWith("~~", i) && !text.startsWith("~~~", i)) {
      const end = text.indexOf("~~", i + 2);
      if (end !== -1) {
        result += `<del>${processInline(text.slice(i + 2, end))}</del>`;
        i = end + 2;
        continue;
      }
    }

    if (text.startsWith("**", i)) {
      const end = text.indexOf("**", i + 2);
      if (end !== -1 && text.slice(i + 2, end).includes("**") === false) {
        result += `<strong>${processInline(text.slice(i + 2, end))}</strong>`;
        i = end + 2;
        continue;
      }
    }

    if (text.startsWith("*", i) && !text.startsWith("**", i)) {
      const end = text.indexOf("*", i + 1);
      if (end !== -1 && text[i + 1] !== " " && text[end - 1] !== " ") {
        result += `<em>${processInline(text.slice(i + 1, end))}</em>`;
        i = end + 1;
        continue;
      }
    }

    if (text.startsWith("__", i)) {
      const end = text.indexOf("__", i + 2);
      if (end !== -1) {
        result += `<strong>${processInline(text.slice(i + 2, end))}</strong>`;
        i = end + 2;
        continue;
      }
    }

    if (text.startsWith("_", i) && !text.startsWith("__", i)) {
      const end = text.indexOf("_", i + 1);
      if (end !== -1 && text[i + 1] !== " " && text[end - 1] !== " ") {
        result += `<em>${processInline(text.slice(i + 1, end))}</em>`;
        i = end + 1;
        continue;
      }
    }

    if (text.startsWith("`", i)) {
      let count = 0;
      while (i + count < text.length && text[i + count] === "`") count++;
      const end = text.indexOf("`".repeat(count), i + count);
      if (end !== -1) {
        const code = text.slice(i + count, end);
        result += `<code>${escapeHtml(code)}</code>`;
        i = end + count;
        continue;
      }
    }

    result += text[i];
    i += 1;
  }

  return result;
}

function processTableRow(cells: string[], align: string[]): string {
  const cols = cells.map((cell, idx) => {
    const a = align[idx] || "left";
    const alignAttr = a === "left" ? "" : ` style="text-align:${a}"`;
    return `    <td${alignAttr}>${processInline(cell.trim())}</td>\n`;
  });
  return `  <tr>\n${cols.join("")}  </tr>\n`;
}

export function parseMarkdown(input: string): ParseResult {
  if (!input) return { html: "", toc: [] };

  const lines = input.split("\n");
  const toc: TocEntry[] = [];
  const idCounts = new Map<string, number>();
  const placeholderMap = new Map<string, string>();
  let placeholderIdx = 0;

  function nextPlaceholder(): string {
    const ph = `\u{E000}CODEBLOCK${placeholderIdx}\u{E000}`;
    placeholderIdx++;
    return ph;
  }

  const processedLines: string[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let codeBlockLang = "";

  for (const rawLine of lines) {
    const trimmed = rawLine.trimEnd();

    if (trimmed.startsWith("```")) {
      if (!inCodeBlock) {
        codeBlockLang = trimmed.slice(3).trim();
        codeBlockContent = [];
        inCodeBlock = true;
      } else {
        const content = codeBlockContent.join("\n");
        const escaped = escapeHtml(content);
        const langClass = codeBlockLang ? ` class="lang-${escapeHtml(codeBlockLang)}"` : "";
        const ph = nextPlaceholder();
        placeholderMap.set(
          ph,
          `<pre${langClass}><code${langClass}>${escaped}\n</code></pre>\n`,
        );
        processedLines.push(ph);
        inCodeBlock = false;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(rawLine);
      continue;
    }

    processedLines.push(rawLine);
  }

  if (inCodeBlock && codeBlockContent.length > 0) {
    const content = codeBlockContent.join("\n");
    const escaped = escapeHtml(content);
    const ph = nextPlaceholder();
    placeholderMap.set(
      ph,
      `<pre class="lang-${escapeHtml(codeBlockLang || "")}"><code class="lang-${escapeHtml(codeBlockLang || "")}">${escaped}\n</code></pre>\n`,
    );
    processedLines.push(ph);
  }

  const firstPassLines = processedLines;


  const tableRegex = /^\|(.+)\|\s*$/;

  const outputLines: string[] = [];
  let i = 0;

  while (i < firstPassLines.length) {
    const line = firstPassLines[i];

    if (line === "" || line.trim() === "") {
      outputLines.push(line);
      i++;
      continue;
    }

    if (line === "\x00") {
      outputLines.push(line);
      i++;
      continue;
    }

    const hrMatch = line.match(/^ {0,3}([-*_])[ \t]*\1[ \t]*\1[ \t]*$/);
    if (hrMatch && line.replace(/[ \t]/g, "").length >= 3) {
      outputLines.push("<hr />");
      i++;
      continue;
    }

    const headerMatch = line.match(/^(#{1,6})\s+(.*?)(?:\s+#{1,6})?\s*$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const rawText = headerMatch[2].trim();
      if (rawText) {
        const escaped = escapeHtml(rawText);
        const baseSlug = slugify(rawText);
        const id = makeId(idCounts, baseSlug);
        toc.push({ id, text: rawText, level });
        outputLines.push(
          `<h${level} id="${id}">${processInline(escaped)}</h${level}>`,
        );
      }
      i++;
      continue;
    }

    if (line.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < firstPassLines.length && firstPassLines[i].startsWith(">")) {
        const raw = firstPassLines[i];
        const content = raw.replace(/^>\s?/, "");
        quoteLines.push(content);
        i++;
      }
      const inner = quoteLines.join("\n");
      const ph = nextPlaceholder();
      placeholderMap.set(
        ph,
        `<blockquote>\n<p>${processInline(escapeHtml(inner))}</p>\n</blockquote>\n`,
      );
      outputLines.push(ph);
      continue;
    }

    if (tableRegex.test(line)) {
      const tableRows: string[] = [];
      let headerRow: string[] | null = null;
      let alignRow: string[] = [];
      while (i < firstPassLines.length) {
        const cur = firstPassLines[i];
        if (!cur.startsWith("|") || !cur.endsWith("|")) break;

        const cells = cur
          .split("|")
          .slice(1, -1)
          .map((c) => c.trim());

        if (!headerRow) {
          headerRow = cells;
          i++;
          continue;
        }

        if (alignRow.length === 0 && /^:?-+:?$/.test(cells.join(""))) {
          alignRow = cells.map((c) => {
            if (/^:-+:$/.test(c)) return "center";
            if (/^:-+$/.test(c)) return "left";
            if (/^-+:$/.test(c)) return "right";
            return "left";
          });
          i++;
          continue;
        }

        tableRows.push(processTableRow(cells, alignRow));
        i++;
      }

      if (headerRow) {
        const headerCells = headerRow
          .map((cell, idx) => {
            const a = alignRow[idx] || "left";
            const alignAttr = a === "left" ? "" : ` style="text-align:${a}"`;
            return `    <th${alignAttr}>${processInline(cell.trim())}</th>\n`;
          })
          .join("");

        const thead = `  <thead>\n    <tr>\n${headerCells}    </tr>\n  </thead>\n`;
        const tbody = tableRows.length > 0
          ? `  <tbody>\n${tableRows.join("")}  </tbody>\n`
          : "";
        outputLines.push(`<table>\n${thead}${tbody}</table>\n`);
      }
      continue;
    }

    const unorderedListItem = line.match(/^ {0,3}([-*+])\s+(.*)$/);
    const orderedListItem = line.match(/^ {0,3}\d+\.\s+(.*)$/);

    if (unorderedListItem || orderedListItem) {
      const listLines: { text: string; ordered: boolean }[] = [];


      while (i < firstPassLines.length) {
        const cur = firstPassLines[i];
        if (cur.trim() === "") { i++; break; }

        const ul = cur.match(/^(\s*)([-*+])\s+(.*)$/);
        const ol = cur.match(/^(\s*)(\d+)\.\s+(.*)$/);
        if (!ul && !ol) break;

        const isOrdered = !!ol;
        const content = (ol?.[3] || ul?.[3] || "").trim();

        listLines.push({ text: content, ordered: isOrdered });
        i++;
      }

      const listHtml = renderList(listLines);
      outputLines.push(listHtml);
      continue;
    }

    const paraLines: string[] = [];
    while (i < firstPassLines.length) {
      const cur = firstPassLines[i];
      if (cur === "" || cur.trim() === "") break;

      const nextUl = cur.match(/^ {0,3}([-*+])\s/);
      const nextOl = cur.match(/^ {0,3}\d+\.\s/);
      if (nextUl || nextOl) break;

      if (cur.startsWith("```") || cur.startsWith(">") || cur.startsWith("|")) break;

      if (/^ {0,3}([-*_])[ \t]*\1[ \t]*\1[ \t]*$/.test(cur.replace(/[ \t]/g, ""))) break;

      if (/^#{1,6}\s/.test(cur)) break;

      paraLines.push(cur);
      i++;
    }

    if (paraLines.length > 0) {
      const paraText = paraLines.map((l) => {
        const trimmed = l.trim();
        if (trimmed.endsWith("  ")) {
          return trimmed.slice(0, -2) + "<br />\n";
        }
        return trimmed;
      }).join(" ");

      const ph = nextPlaceholder();
      placeholderMap.set(
        ph,
        `<p>${processInline(escapeHtml(paraText))}</p>\n`,
      );
      outputLines.push(ph);
      continue;
    }

    outputLines.push(line);
    i++;
  }

  let html = outputLines.join("\n");

  html = html.replace(/\u{E000}CODEBLOCK\d+\u{E000}/gu, (match) => {
    return placeholderMap.get(match) || match;
  });

  html = html.replace(/\n{3,}/g, "\n\n");

  return { html, toc };
}

function renderList(items: { text: string; ordered: boolean }[]): string {
  const result: string[] = [];
  const stack: { tag: string; items: string[] }[] = [];
  let prevOrdered: boolean | null = null;

  function closeList(): void {
    const frame = stack.pop();
    if (!frame) return;
    const inner = frame.items.join("\n");
    result.push(`<${frame.tag}>\n${inner}\n</${frame.tag}>\n`);
  }

  for (const item of items) {
    if (prevOrdered === null || item.ordered !== prevOrdered) {
      if (stack.length > 0) closeList();
      prevOrdered = item.ordered;
    }

    const tag = item.ordered ? "ol" : "ul";
    if (stack.length === 0) {
      stack.push({ tag, items: [] });
    }

    const taskMatch = item.text.match(/^\[([ xX])\]\s+(.*)$/);
    let checkbox = "";
    let content = item.text;

    if (taskMatch) {
      const checked = taskMatch[1] !== " " && taskMatch[1] !== "";
      const checkedAttr = checked ? ' checked=""' : "";
      checkbox = `<input type="checkbox" disabled${checkedAttr} class="task-list-item-checkbox" /> `;
      content = taskMatch[2];
    }

    const processed = processInline(escapeHtml(content));
    stack[0].items.push(`  <li>${checkbox}${processed}</li>`);
  }

  while (stack.length > 0) closeList();

  return result.join("");
}
