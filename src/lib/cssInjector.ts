let styleElement: HTMLStyleElement | null = null;

async function getQuantumDir(): Promise<string | null> {
  try {
    const { appDataDir } = await import("@tauri-apps/api/path");
    const base = await appDataDir();
    return `${base}.quantum`;
  } catch {
    return null;
  }
}

export async function initCSSInjector(): Promise<void> {
  const baseDir = await getQuantumDir();
  if (!baseDir) return;

  try {
    const { exists, readTextFile } = await import("@tauri-apps/plugin-fs");
    const cssPath = `${baseDir}/custom.css`;
    const cssExists = await exists(cssPath);
    if (!cssExists) return;

    const content = await readTextFile(cssPath);
    applyCSS(content);
  } catch {
    // Tauri fs plugin not available
  }
}

export async function reloadCSS(): Promise<void> {
  removeCSS();
  await initCSSInjector();
}

function applyCSS(css: string): void {
  removeCSS();
  styleElement = document.createElement("style");
  styleElement.id = "quantum-custom-css";
  styleElement.setAttribute("data-qa", "custom-css");
  styleElement.textContent = css;
  document.head.appendChild(styleElement);
}

function removeCSS(): void {
  if (styleElement) {
    styleElement.remove();
    styleElement = null;
  }
}
