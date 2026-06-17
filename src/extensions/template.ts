export function generateExtensionFolder(name: string): string {
  return '{\n' +
    `  "name": "${name}",\n` +
    `  "displayName": "${name}",\n` +
    '  "description": "",\n' +
    '  "version": "0.1.0",\n' +
    '  "main": "index.js"\n' +
    '}\n';
}

export function generateExtensionMain(name: string): string {
  return (
    `// ${name}\n` +
    `//\n` +
    `// API:\n` +
    `//   api.commands.register(id, handler)        - registered command appears in CommandPalette\n` +
    `//   api.editor.onOpen/onClose/onSave/onChange - editor event hooks\n` +
    `//   api.editor.onDidChangeActiveEditor/onDidChangeCursorPosition\n` +
    `//   api.editor.getActiveDocument(), openFile(path)\n` +
    `//   api.window.showInfo/showWarn/showError    - toast notifications\n` +
    `//   api.window.showInput(prompt), showQuickPick(items)\n` +
    `//   api.statusBar.create({ text, alignment?, priority?, tooltip?, command? })\n` +
    `//   api.views.register(id, { title, icon?, render, onDispose? })\n` +
    `//   api.settings.get(key), set(key, value), onChanged(cb)\n` +
    `//   api.storage.get(key), set(key, value)\n` +
    `//   api.fs.readFile(path), writeFile(path, content), listDir(path), exists(path)\n` +
    `//   api.monaco.editor, languages, getEditor() - full Monaco access\n` +
    `//\n` +
    `// Return a cleanup function from activate().\n` +
    `\n` +
    `export function activate(api) {\n` +
    `  api.window.showInfo("${name} activated");\n` +
    `\n` +
    `  api.commands.register("${name}.hello", () => {\n` +
    `    api.window.showInfo("Hello from ${name}!");\n` +
    `  });\n` +
    `\n` +
    `  const status = api.statusBar.create({\n` +
    `    text: "${name}",\n` +
    `    alignment: "right",\n` +
    `    priority: 0,\n` +
    `    tooltip: "${name} is active",\n` +
    `  });\n` +
    `\n` +
    `  api.editor.onOpen((doc) => {\n` +
    `    console.log("Opened:", doc.path);\n` +
    `  });\n` +
    `\n` +
    `  api.editor.onSave((doc) => {\n` +
    `    console.log("Saved:", doc.path);\n` +
    `  });\n` +
    `\n` +
    `  return () => {\n` +
    `    status.dispose();\n` +
    `  };\n` +
    `}\n`
  );
}
