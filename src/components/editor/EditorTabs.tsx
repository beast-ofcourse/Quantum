import { useState, useCallback } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { EditorTab } from "./EditorTab";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { Tab } from "@/types/editor";

type CloseKind = "close" | "closeOthers" | "closeAll";

export function EditorTabs() {
  const openTabs = useEditorStore((s) => s.openTabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const reorderTab = useEditorStore((s) => s.reorderTab);
  const [pendingClose, setPendingClose] = useState<{
    tab: Tab;
    kind: CloseKind;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIdx = openTabs.findIndex((t) => t.id === active.id);
      const newIdx = openTabs.findIndex((t) => t.id === over.id);
      if (oldIdx !== -1 && newIdx !== -1) {
        reorderTab(oldIdx, newIdx);
      }
    },
    [openTabs, reorderTab],
  );

  const tryClose = async (id: string) => {
    const tab = openTabs.find((t) => t.id === id);
    if (!tab) return true;
    if (tab.pinned) return false;
    if (!tab.isDirty) {
      useEditorStore.getState().setLastClosedTab({ path: tab.path, name: tab.name });
      await useEditorStore.getState().closeTab(id, { force: true });
      return true;
    }
    setPendingClose({ tab, kind: "close" });
    return false;
  };

  const tryCloseOthers = async (id: string) => {
    const dirty = openTabs.filter((t) => t.id !== id && t.isDirty && !t.pinned);
    if (dirty.length === 0) {
      await useEditorStore.getState().closeOthers(id, { force: true });
      return;
    }
    const keep = openTabs.find((t) => t.id === id);
    if (keep) setPendingClose({ tab: keep, kind: "closeOthers" });
  };

  const tryCloseAll = async () => {
    if (!openTabs.some((t) => t.isDirty && !t.pinned)) {
      await useEditorStore.getState().closeAll({ force: true });
      return;
    }
    const first = openTabs.find((t) => !t.pinned);
    if (first) setPendingClose({ tab: first, kind: "closeAll" });
  };

  const tryCloseToTheRight = (id: string) => {
    useEditorStore.getState().closeToTheRight(id);
  };

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={openTabs.map((t) => t.id)}
          strategy={horizontalListSortingStrategy}
        >
          <div
            role="tablist"
            aria-label="Open editors"
            className="flex h-8 shrink-0 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {openTabs.map((tab) => (
              <EditorTab
                key={tab.id}
                tab={tab}
                isActive={tab.id === activeTabId}
                onClose={tryClose}
                onCloseOthers={tryCloseOthers}
                onCloseAll={tryCloseAll}
                onCloseToTheRight={tryCloseToTheRight}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <UnsavedChangesDialog
        state={pendingClose}
        onCancel={() => setPendingClose(null)}
        onDontSave={async () => {
          if (!pendingClose) return;
          if (pendingClose.kind === "close") {
            await useEditorStore.getState().closeTab(pendingClose.tab.id, { force: true });
          } else if (pendingClose.kind === "closeOthers") {
            await useEditorStore.getState().closeOthers(pendingClose.tab.id, { force: true });
          } else {
            await useEditorStore.getState().closeAll({ force: true });
          }
          setPendingClose(null);
        }}
        onSave={async () => {
          if (!pendingClose) return;
          if (pendingClose.kind === "closeOthers") {
            const dirty = openTabs.filter((t) => t.id !== pendingClose.tab.id && t.isDirty);
            for (const t of dirty) await useEditorStore.getState().saveFile(t.id);
            await useEditorStore.getState().closeOthers(pendingClose.tab.id, { force: true });
          } else if (pendingClose.kind === "closeAll") {
            await useEditorStore.getState().saveAll();
            await useEditorStore.getState().closeAll({ force: true });
          } else {
            await useEditorStore.getState().saveFile(pendingClose.tab.id);
            await useEditorStore.getState().closeTab(pendingClose.tab.id, { force: true });
          }
          setPendingClose(null);
        }}
      />
    </>
  );
}
