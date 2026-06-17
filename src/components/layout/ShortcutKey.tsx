import { useKeybindingStore } from "@/stores/keybindingStore";
import { getDefaultCombo } from "@/lib/defaultKeybindings";
import { getPlatformModifier } from "@/lib/platform";

function formatCombo(combo: string): string {
  if (!combo) return "";
  const mod = getPlatformModifier() === "Cmd" ? "⌘" : "Ctrl";
  return combo
    .replace("mod", mod)
    .split("+")
    .map((k) => {
      if (k === "shift") return "⇧";
      if (k === "alt") return "⌥";
      if (k === "`") return "`";
      if (k === ",") return ",";
      return k.charAt(0).toUpperCase() + k.slice(1);
    })
    .join("");
}

export function ShortcutKey({ commandId }: { commandId: string }) {
  const override = useKeybindingStore((s) => s.overrides[commandId]);
  const combo = override ?? getDefaultCombo(commandId);
  if (!combo) return null;
  return <>{formatCombo(combo)}</>;
}
