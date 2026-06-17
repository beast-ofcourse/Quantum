import { useTerminalStore } from "@/stores/terminalStore";
import { useUiStore } from "@/stores/uiStore";

export async function openAndCreateTerminalSession() {
  const ui = useUiStore.getState();
  const createSession = useTerminalStore.getState().createSession;

  if (!ui.zones.bottom.isVisible) {
    ui.setZoneVisibility("bottom", true);
  }
  ui.setActivePanel("terminal");
  await createSession();
}

export async function openTerminalAtPath(cwd: string) {
  const ui = useUiStore.getState();
  const store = useTerminalStore.getState();

  if (!ui.zones.bottom.isVisible) {
    ui.setZoneVisibility("bottom", true);
  }
  ui.setActivePanel("terminal");
  await store.createSession(undefined, cwd);
}
