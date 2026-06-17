import { describe, it, expect, beforeEach } from "vitest";
import { useExtensionStatusBarStore } from "@/stores/extensionStatusBarStore";
import type { ExtensionStatusItem } from "@/stores/extensionStatusBarStore";

function createItem(overrides: Partial<ExtensionStatusItem> = {}): ExtensionStatusItem {
  return {
    id: "test-item",
    extensionId: "test-ext",
    text: "Ready",
    alignment: "left",
    priority: 0,
    visible: true,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  useExtensionStatusBarStore.setState(useExtensionStatusBarStore.getInitialState());
});

describe("extensionStatusBarStore", () => {
  it("starts with empty items array", () => {
    expect(useExtensionStatusBarStore.getState().items).toHaveLength(0);
  });

  it("addItem adds an item correctly", () => {
    const item = createItem();
    useExtensionStatusBarStore.getState().addItem(item);
    const items = useExtensionStatusBarStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual(item);
  });

  it("addItem adds multiple items", () => {
    useExtensionStatusBarStore.getState().addItem(createItem({ id: "item1", extensionId: "ext1" }));
    useExtensionStatusBarStore.getState().addItem(createItem({ id: "item2", extensionId: "ext2" }));
    expect(useExtensionStatusBarStore.getState().items).toHaveLength(2);
  });

  it("removeItem removes the item by id", () => {
    useExtensionStatusBarStore.getState().addItem(createItem({ id: "item1" }));
    useExtensionStatusBarStore.getState().addItem(createItem({ id: "item2" }));
    useExtensionStatusBarStore.getState().removeItem("item1");
    const remaining = useExtensionStatusBarStore.getState().items;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe("item2");
  });

  it("removeItem on non-existent id is a no-op", () => {
    useExtensionStatusBarStore.getState().addItem(createItem());
    useExtensionStatusBarStore.getState().removeItem("non-existent");
    expect(useExtensionStatusBarStore.getState().items).toHaveLength(1);
  });

  it("updateItemText updates the text of an item", () => {
    useExtensionStatusBarStore.getState().addItem(createItem({ id: "item1", text: "Old text" }));
    useExtensionStatusBarStore.getState().updateItemText("item1", "New text");
    expect(useExtensionStatusBarStore.getState().items[0].text).toBe("New text");
  });

  it("updateItemText does not affect other items", () => {
    useExtensionStatusBarStore.getState().addItem(createItem({ id: "item1", text: "Text A" }));
    useExtensionStatusBarStore.getState().addItem(createItem({ id: "item2", text: "Text B" }));
    useExtensionStatusBarStore.getState().updateItemText("item1", "Changed");
    expect(useExtensionStatusBarStore.getState().items[1].text).toBe("Text B");
  });

  it("updateItemText on non-existent id is a no-op", () => {
    useExtensionStatusBarStore.getState().addItem(createItem({ id: "item1", text: "Text" }));
    useExtensionStatusBarStore.getState().updateItemText("non-existent", "Changed");
    expect(useExtensionStatusBarStore.getState().items[0].text).toBe("Text");
  });

  it("setItemVisible sets visibility of an item", () => {
    useExtensionStatusBarStore.getState().addItem(createItem({ id: "item1", visible: true }));
    useExtensionStatusBarStore.getState().setItemVisible("item1", false);
    expect(useExtensionStatusBarStore.getState().items[0].visible).toBe(false);

    useExtensionStatusBarStore.getState().setItemVisible("item1", true);
    expect(useExtensionStatusBarStore.getState().items[0].visible).toBe(true);
  });

  it("setItemVisible on non-existent id is a no-op", () => {
    useExtensionStatusBarStore.getState().addItem(createItem({ id: "item1", visible: true }));
    useExtensionStatusBarStore.getState().setItemVisible("non-existent", false);
    expect(useExtensionStatusBarStore.getState().items[0].visible).toBe(true);
  });
});
