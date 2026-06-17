import { describe, it, expect, beforeEach } from "vitest";
import { useModalStore } from "@/stores/modalStore";

beforeEach(() => {
  localStorage.clear();
  useModalStore.setState(useModalStore.getInitialState());
});

describe("modalStore", () => {
  it("has null modal initially", () => {
    expect(useModalStore.getState().modal).toBeNull();
  });

  it("openInput sets modal to input kind with prompt", () => {
    const promise = useModalStore.getState().openInput("Enter name:");
    const state = useModalStore.getState();
    expect(state.modal).not.toBeNull();
    expect(state.modal!.kind).toBe("input");
    expect((state.modal! as { prompt: string }).prompt).toBe("Enter name:");
    expect(typeof (state.modal! as { resolve: (...args: unknown[]) => unknown }).resolve).toBe("function");
    expect(promise).toBeInstanceOf(Promise);
  });

  it("openQuickPick sets modal to quickpick kind with items", () => {
    const items = ["item1", "item2", "item3"];
    const promise = useModalStore.getState().openQuickPick(items, "Select an item");
    const state = useModalStore.getState();
    expect(state.modal).not.toBeNull();
    expect(state.modal!.kind).toBe("quickpick");
    const qp = state.modal! as { items: string[]; placeHolder?: string };
    expect(qp.items).toEqual(items);
    expect(qp.placeHolder).toBe("Select an item");
    expect(promise).toBeInstanceOf(Promise);
  });

  it("openQuickPick works without placeHolder", () => {
    useModalStore.getState().openQuickPick(["a", "b"]);
    const state = useModalStore.getState();
    expect(state.modal!.kind).toBe("quickpick");
    const qp = state.modal! as { placeHolder?: string };
    expect(qp.placeHolder).toBeUndefined();
  });

  it("closeModal clears the modal and resolves with null", async () => {
    const promise = useModalStore.getState().openInput("Enter name:");
    useModalStore.getState().closeModal();
    expect(useModalStore.getState().modal).toBeNull();
    await expect(promise).resolves.toBeNull();
  });

  it("closeModal is a no-op when no modal is open", () => {
    expect(() => useModalStore.getState().closeModal()).not.toThrow();
    expect(useModalStore.getState().modal).toBeNull();
  });

  it("resolveModal clears the modal and resolves with the given value", async () => {
    const promise = useModalStore.getState().openInput("Enter name:");
    useModalStore.getState().resolveModal("Alice");
    expect(useModalStore.getState().modal).toBeNull();
    await expect(promise).resolves.toBe("Alice");
  });

  it("resolveModal is a no-op when no modal is open", () => {
    expect(() => useModalStore.getState().resolveModal("test")).not.toThrow();
    expect(useModalStore.getState().modal).toBeNull();
  });

  it("opening a new modal replaces the old one", () => {
    useModalStore.getState().openInput("First prompt");
    useModalStore.getState().openQuickPick(["a", "b"]);
    const state = useModalStore.getState();
    expect(state.modal).not.toBeNull();
    expect(state.modal!.kind).toBe("quickpick");
  });
});
