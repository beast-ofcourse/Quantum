import { describe, it, expect, beforeEach } from "vitest";
import { useKeybindingStore, getEffectiveCombo } from "@/stores/keybindingStore";

beforeEach(() => {
  localStorage.clear();
  useKeybindingStore.setState(useKeybindingStore.getInitialState());
});

describe("keybindingStore", () => {
  it("has empty overrides initially", () => {
    expect(useKeybindingStore.getState().overrides).toEqual({});
  });

  it("setBinding stores an override", () => {
    useKeybindingStore.getState().setBinding("file.save", "mod+shift+s");
    expect(useKeybindingStore.getState().overrides["file.save"]).toBe("mod+shift+s");
  });

  it("setBinding replaces existing override for same command", () => {
    useKeybindingStore.getState().setBinding("file.save", "mod+shift+s");
    useKeybindingStore.getState().setBinding("file.save", "alt+s");
    expect(useKeybindingStore.getState().overrides["file.save"]).toBe("alt+s");
  });

  it("resetBinding removes a specific override", () => {
    useKeybindingStore.getState().setBinding("file.save", "mod+shift+s");
    useKeybindingStore.getState().resetBinding("file.save");
    expect(useKeybindingStore.getState().overrides).not.toHaveProperty("file.save");
  });

  it("resetBinding does not affect other overrides", () => {
    useKeybindingStore.getState().setBinding("file.save", "mod+shift+s");
    useKeybindingStore.getState().setBinding("file.open", "mod+o");
    useKeybindingStore.getState().resetBinding("file.save");
    expect(useKeybindingStore.getState().overrides["file.open"]).toBe("mod+o");
  });

  it("resetBinding on non-existent override is a no-op", () => {
    useKeybindingStore.getState().resetBinding("non.existent");
    expect(useKeybindingStore.getState().overrides).toEqual({});
  });

  it("resetAll clears all overrides", () => {
    useKeybindingStore.getState().setBinding("file.save", "mod+shift+s");
    useKeybindingStore.getState().setBinding("file.open", "mod+shift+o");
    useKeybindingStore.getState().resetAll();
    expect(useKeybindingStore.getState().overrides).toEqual({});
  });

  it("getEffectiveCombo returns override when set", () => {
    useKeybindingStore.getState().setBinding("file.save", "mod+shift+s");
    expect(getEffectiveCombo("file.save")).toBe("mod+shift+s");
  });

  it("getEffectiveCombo returns default combo when no override exists", () => {
    expect(getEffectiveCombo("file.save")).toBe("mod+s");
  });

  it("getEffectiveCombo returns empty string for unknown command", () => {
    expect(getEffectiveCombo("unknown.command")).toBe("");
  });

  it("persists overrides to localStorage", () => {
    useKeybindingStore.getState().setBinding("file.save", "alt+s");
    const raw = localStorage.getItem("code-editor:keybindings");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.overrides["file.save"]).toBe("alt+s");
  });
});
