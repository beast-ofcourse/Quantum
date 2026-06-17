import { createCommandsAPI } from "./commands";
import { createEditorAPI } from "./editor";
import { createWindowAPI } from "./window";
import { createStatusBarAPI } from "./statusBar";
import { createSettingsAPI } from "./settings";
import { createFsAPI } from "./fs";
import { createStorageAPI } from "./storage";
import { createViewsAPI } from "./views";
import { createLspApi } from "./lsp";
import { getCurrentEditor, getMonacoModule } from "../editorRef";
import type { ExtensionAPI } from "../types";

export function createAPI(extensionId: string, extensionDir: string): ExtensionAPI {
  return {
    extensionDir,
    commands: createCommandsAPI(),
    editor: createEditorAPI(),
    window: createWindowAPI(),
    statusBar: createStatusBarAPI(extensionId),
    settings: createSettingsAPI(),
    fs: createFsAPI(),
    storage: createStorageAPI(extensionId),
    views: createViewsAPI(extensionId),
    monaco: {
      get editor() {
        return getMonacoModule()?.editor ?? null;
      },
      get languages() {
        return getMonacoModule()?.languages ?? null;
      },
      getEditor() {
        return getCurrentEditor();
      },
    },
    lsp: createLspApi(),
  };
}
