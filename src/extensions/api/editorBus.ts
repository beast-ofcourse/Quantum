import type { Document, ChangeEvent, CursorEvent } from "../types";

type OpenCB = (doc: Document) => void;
type CloseCB = (doc: Document) => void;
type SaveCB = (doc: Document) => void;
type ChangeCB = (e: ChangeEvent) => void;
type ActiveCB = (doc: Document | null) => void;
type CursorCB = (e: CursorEvent) => void;

class EditorEventBus {
  private open = new Set<OpenCB>();
  private close = new Set<CloseCB>();
  private save = new Set<SaveCB>();
  private change = new Set<ChangeCB>();
  private active = new Set<ActiveCB>();
  private cursor = new Set<CursorCB>();

  onOpen(cb: OpenCB): () => void {
    this.open.add(cb);
    return () => this.open.delete(cb);
  }
  onClose(cb: CloseCB): () => void {
    this.close.add(cb);
    return () => this.close.delete(cb);
  }
  onSave(cb: SaveCB): () => void {
    this.save.add(cb);
    return () => this.save.delete(cb);
  }
  onChange(cb: ChangeCB): () => void {
    this.change.add(cb);
    return () => this.change.delete(cb);
  }
  onActiveEditor(cb: ActiveCB): () => void {
    this.active.add(cb);
    return () => this.active.delete(cb);
  }
  onCursor(cb: CursorCB): () => void {
    this.cursor.add(cb);
    return () => this.cursor.delete(cb);
  }

  emitOpen(doc: Document) {
    this.open.forEach((cb) => { try { cb(doc); } catch { /* noop */ } });
  }
  emitClose(doc: Document) {
    this.close.forEach((cb) => { try { cb(doc); } catch { /* noop */ } });
  }
  emitSave(doc: Document) {
    this.save.forEach((cb) => { try { cb(doc); } catch { /* noop */ } });
  }
  emitChange(e: ChangeEvent) {
    this.change.forEach((cb) => { try { cb(e); } catch { /* noop */ } });
  }
  emitActiveEditor(doc: Document | null) {
    this.active.forEach((cb) => { try { cb(doc); } catch { /* noop */ } });
  }
  emitCursor(e: CursorEvent) {
    this.cursor.forEach((cb) => { try { cb(e); } catch { /* noop */ } });
  }
}

export const editorBus = new EditorEventBus();
