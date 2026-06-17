import type * as monaco from "monaco-editor";

let currentEditor: monaco.editor.IStandaloneCodeEditor | null = null;
let monacoModule: typeof monaco | null = null;

export function setMonacoEditor(
  editor: monaco.editor.IStandaloneCodeEditor | null,
  mod: typeof monaco | null,
) {
  currentEditor = editor;
  monacoModule = mod;
}

export function getCurrentEditor(): monaco.editor.IStandaloneCodeEditor | null {
  return currentEditor;
}

export function getMonacoModule(): typeof monaco | null {
  return monacoModule;
}
