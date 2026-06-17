import { Disposable, disposableFrom } from "../types";
import type { Document, ChangeEvent, CursorEvent } from "../types";
import { useEditorStore } from "@/stores/editorStore";
import { editorBus } from "./editorBus";

type OpenCallback = (doc: Document) => void;
type CloseCallback = (doc: Document) => void;
type SaveCallback = (doc: Document) => void;
type ChangeCallback = (e: ChangeEvent) => void;
type ActiveEditorCallback = (doc: Document | null) => void;
type CursorCallback = (e: CursorEvent) => void;

export function createEditorAPI() {
  const unsubs: (() => void)[] = [];

  const api = {
    onOpen(cb: OpenCallback): Disposable {
      const unsub = editorBus.onOpen(cb);
      unsubs.push(unsub);
      return disposableFrom(() => {
        unsub();
        const idx = unsubs.indexOf(unsub);
        if (idx !== -1) unsubs.splice(idx, 1);
      });
    },
    onClose(cb: CloseCallback): Disposable {
      const unsub = editorBus.onClose(cb);
      unsubs.push(unsub);
      return disposableFrom(() => {
        unsub();
        const idx = unsubs.indexOf(unsub);
        if (idx !== -1) unsubs.splice(idx, 1);
      });
    },
    onSave(cb: SaveCallback): Disposable {
      const unsub = editorBus.onSave(cb);
      unsubs.push(unsub);
      return disposableFrom(() => {
        unsub();
        const idx = unsubs.indexOf(unsub);
        if (idx !== -1) unsubs.splice(idx, 1);
      });
    },
    onChange(cb: ChangeCallback): Disposable {
      const unsub = editorBus.onChange(cb);
      unsubs.push(unsub);
      return disposableFrom(() => {
        unsub();
        const idx = unsubs.indexOf(unsub);
        if (idx !== -1) unsubs.splice(idx, 1);
      });
    },
    onDidChangeActiveEditor(cb: ActiveEditorCallback): Disposable {
      const unsub = editorBus.onActiveEditor(cb);
      unsubs.push(unsub);
      return disposableFrom(() => {
        unsub();
        const idx = unsubs.indexOf(unsub);
        if (idx !== -1) unsubs.splice(idx, 1);
      });
    },
    onDidChangeCursorPosition(cb: CursorCallback): Disposable {
      const unsub = editorBus.onCursor(cb);
      unsubs.push(unsub);
      return disposableFrom(() => {
        unsub();
        const idx = unsubs.indexOf(unsub);
        if (idx !== -1) unsubs.splice(idx, 1);
      });
    },
    getActiveDocument(): Document | null {
      const tab = useEditorStore.getState().getActiveTab();
      if (!tab) return null;
      return {
        path: tab.path,
        language: tab.language,
        content: tab.currentContent,
        isDirty: tab.isDirty,
      };
    },
    async openFile(path: string): Promise<void> {
      await useEditorStore.getState().openFile(path);
    },
  };

  return api;
}

export type EditorAPI = ReturnType<typeof createEditorAPI>;
