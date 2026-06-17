import { useEffect, useRef } from "react";
import {
  getHotkeyRegistry,
  type HotkeyBinding,
  type HotkeyHandler,
} from "@/lib/hotkeys";
import { useKeybindingStore } from "@/stores/keybindingStore";
import { getDefaultCombo } from "@/lib/defaultKeybindings";

export interface UseHotkeyOptions {
  combo: string;
  commandId?: string;
  description: string;
  handler: HotkeyHandler;
  preventDefault?: boolean;
  allowInInputs?: boolean;
  enabled?: boolean;
}

export function useHotkey(options: UseHotkeyOptions) {
  const enabled = options.enabled ?? true;
  const handlerRef = useRef<HotkeyHandler>(options.handler);

  const override = options.commandId
    ? useKeybindingStore((s) => s.overrides[options.commandId!])
    : undefined;
  const effectiveCombo =
    override ?? (options.commandId ? getDefaultCombo(options.commandId) : options.combo);

  useEffect(() => {
    handlerRef.current = options.handler;
  });

  useEffect(() => {
    if (!enabled || !effectiveCombo) return;
    const registry = getHotkeyRegistry();
    const binding: HotkeyBinding = {
      id: `${options.commandId ?? options.combo}::${options.description}`,
      combo: effectiveCombo,
      description: options.description,
      handler: (event) => handlerRef.current(event),
      preventDefault: options.preventDefault,
      allowInInputs: options.allowInInputs,
    };
    return registry.register(binding);
  }, [
    enabled,
    effectiveCombo,
    options.commandId,
    options.combo,
    options.description,
    options.preventDefault,
    options.allowInInputs,
  ]);
}
