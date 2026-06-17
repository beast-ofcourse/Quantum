import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, "languages.ts"), "utf8");

const EXTENSION_MAP = {
  ts: "typescript", tsx: "typescript",
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  json: "json", jsonc: "json",
  html: "html", htm: "html", xml: "xml", svg: "xml",
  css: "css", scss: "scss", sass: "scss", less: "less",
  md: "markdown", mdx: "markdown",
  py: "python", rb: "ruby", rs: "rust", go: "go",
  java: "java", kt: "kotlin", swift: "swift",
  c: "c", h: "c", cpp: "cpp", cxx: "cpp", hpp: "cpp", cs: "csharp", php: "php",
  sh: "shell", bash: "shell", zsh: "shell", ps1: "powershell",
  yaml: "yaml", yml: "yaml", toml: "ini", ini: "ini", env: "ini", sql: "sql",
  dockerfile: "dockerfile", vue: "html", svelte: "html",
};
const FILENAME_MAP = { Dockerfile: "dockerfile", Makefile: "makefile", ".gitignore": "ini", ".env": "ini" };

function getLanguageFromPath(p) {
  const sep = p.includes("\\") ? "\\" : "/";
  const name = p.split(sep).pop();
  if (FILENAME_MAP[name]) return FILENAME_MAP[name];
  const dot = name.lastIndexOf(".");
  if (dot === -1) return "plaintext";
  const ext = name.slice(dot + 1).toLowerCase();
  return EXTENSION_MAP[ext] ?? "plaintext";
}

test("maps common extensions", () => {
  assert.equal(getLanguageFromPath("/a/b/foo.ts"), "typescript");
  assert.equal(getLanguageFromPath("C:\\a\\foo.tsx"), "typescript");
  assert.equal(getLanguageFromPath("/x/y.js"), "javascript");
  assert.equal(getLanguageFromPath("/x/y.json"), "json");
  assert.equal(getLanguageFromPath("/x/y.html"), "html");
  assert.equal(getLanguageFromPath("/x/y.css"), "css");
  assert.equal(getLanguageFromPath("/x/y.md"), "markdown");
  assert.equal(getLanguageFromPath("/x/y.rs"), "rust");
  assert.equal(getLanguageFromPath("/x/y.py"), "python");
});

test("maps filenames without extension", () => {
  assert.equal(getLanguageFromPath("/repo/Dockerfile"), "dockerfile");
  assert.equal(getLanguageFromPath("/repo/.gitignore"), "ini");
});

test("falls back to plaintext", () => {
  assert.equal(getLanguageFromPath("/x/y.unknownext"), "plaintext");
  assert.equal(getLanguageFromPath("/x/y"), "plaintext");
});

test("case-insensitive extension", () => {
  assert.equal(getLanguageFromPath("/x/y.JSON"), "json");
  assert.equal(getLanguageFromPath("/x/y.TS"), "typescript");
});

test("languages.ts source references the function", () => {
  assert.match(src, /export function getLanguageFromPath/);
});
