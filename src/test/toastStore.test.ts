import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useToastStore } from "@/stores/toastStore";

beforeEach(() => {
  localStorage.clear();
  useToastStore.setState(useToastStore.getInitialState());
});

afterEach(() => {
  vi.useRealTimers();
});

describe("toastStore", () => {
  it("starts with empty toasts array", () => {
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("addToast adds a toast with the correct properties", () => {
    useToastStore.getState().addToast("info", "Hello world");
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].kind).toBe("info");
    expect(toasts[0].message).toBe("Hello world");
    expect(toasts[0].id).toBeDefined();
    expect(typeof toasts[0].createdAt).toBe("number");
  });

  it("addToast works with all toast kinds", () => {
    useToastStore.getState().addToast("info", "info message");
    useToastStore.getState().addToast("warn", "warning message");
    useToastStore.getState().addToast("error", "error message");
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(3);
    expect(toasts[0].kind).toBe("info");
    expect(toasts[1].kind).toBe("warn");
    expect(toasts[2].kind).toBe("error");
  });

  it("removeToast removes a specific toast by id", () => {
    useToastStore.getState().addToast("info", "first");
    useToastStore.getState().addToast("warn", "second");
    const firstId = useToastStore.getState().toasts[0].id;
    useToastStore.getState().removeToast(firstId);
    const remaining = useToastStore.getState().toasts;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].message).toBe("second");
  });

  it("removeToast on non-existent id is a no-op", () => {
    useToastStore.getState().addToast("info", "test");
    useToastStore.getState().removeToast("non-existent");
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  it("auto-removes toast after 4 seconds", () => {
    vi.useFakeTimers();
    useToastStore.getState().addToast("info", "auto-remove me");
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(4000);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("auto-removal only removes the specific timed-out toast", () => {
    vi.useFakeTimers();
    useToastStore.getState().addToast("info", "first");
    vi.advanceTimersByTime(2000);
    useToastStore.getState().addToast("warn", "second");
    expect(useToastStore.getState().toasts).toHaveLength(2);
    vi.advanceTimersByTime(2000);
    const remaining = useToastStore.getState().toasts;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].message).toBe("second");
  });

  it("multiple toasts get unique IDs", () => {
    useToastStore.getState().addToast("info", "one");
    useToastStore.getState().addToast("warn", "two");
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(2);
    expect(toasts[0].id).not.toBe(toasts[1].id);
  });
});
