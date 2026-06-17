const fs = require("node:fs");
const path = require("node:path");

const platform = process.platform;
let binaryName;
if (platform === "win32") {
  binaryName = "pyright-win32-x64.exe";
} else if (platform === "darwin") {
  if (process.arch === "arm64") {
    binaryName = "pyright-darwin-arm64";
    const armPath = path.join(__dirname, "..", "node_modules", "pyright", "dist", binaryName);
    if (!fs.existsSync(armPath)) {
      binaryName = "pyright-darwin-x64";
    }
  } else {
    binaryName = "pyright-darwin-x64";
  }
} else {
  binaryName = "pyright-linux-x64";
}

const src = path.join(__dirname, "..", "node_modules", "pyright", "dist", binaryName);
const destDir = path.join(__dirname, "..", "resources", "extensions", "python", "bin");
const dest = path.join(destDir, platform === "win32" ? "pyright.exe" : "pyright");
const pyrightPkgDir = path.join(__dirname, "..", "node_modules", "pyright");

if (fs.existsSync(src)) {
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(src, dest);
  try { fs.chmodSync(dest, 0o755); } catch {}
  console.log("Pyright binary copied to", dest);
} else if (fs.existsSync(pyrightPkgDir)) {
  console.log("Platform binary not found — creating Node.js-based pyright wrapper.");
  console.log("  (Python LSP will need Node.js at runtime to function.)");
  fs.mkdirSync(destDir, { recursive: true });
  const distDest = path.join(destDir, "..", "dist");
  if (fs.existsSync(distDest)) {
    fs.rmSync(distDest, { recursive: true });
  }
  const cpSync = (s, d) => {
    if (fs.statSync(s).isDirectory()) {
      fs.mkdirSync(d, { recursive: true });
      for (const entry of fs.readdirSync(s)) {
        cpSync(path.join(s, entry), path.join(d, entry));
      }
    } else {
      fs.copyFileSync(s, d);
    }
  };
  cpSync(path.join(pyrightPkgDir, "dist"), distDest);
  const indexPath = path.join(pyrightPkgDir, "index.js");
  if (fs.existsSync(indexPath)) {
    fs.copyFileSync(indexPath, path.join(destDir, "..", "index.js"));
  }
  const pkgJson = path.join(pyrightPkgDir, "package.json");
  if (fs.existsSync(pkgJson)) {
    fs.copyFileSync(pkgJson, path.join(destDir, "..", "package.json"));
  }
  const wrapperDir = path.dirname(dest);
  const relDist = path.relative(wrapperDir, path.join(destDir, "..", "dist")).replace(/\\/g, "/");
  if (platform === "win32") {
    const wrapper = `@ECHO off
set "PYRIGHT_DIR=%~dp0\\..\\dist"
node "%~dp0\\..\\index.js" %*
`;
    fs.writeFileSync(dest, wrapper);
  } else {
    const wrapper = `#!/bin/sh
basedir=$(dirname "$0")
PYRIGHT_DIR="$basedir/../dist" exec node "$basedir/../index.js" "$@"
`;
    fs.writeFileSync(dest, wrapper);
    try { fs.chmodSync(dest, 0o755); } catch {}
  }
  console.log("Pyright wrapper created at", dest);
} else {
  console.error("Pyright package not found at", pyrightPkgDir);
  console.error("Run: npm install pyright");
  process.exit(1);
}
