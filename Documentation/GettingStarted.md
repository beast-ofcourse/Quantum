# Getting Started with Quantum IDE

This guide details the steps required to set up your environment, install dependencies, run Quantum IDE in development mode, and compile a production-ready package.

---

## 1. System Prerequisites

Before setting up the project locally, verify that your machine has the following tools installed and configured:

### 1. Node.js & npm
* **Required Version:** Node.js version `20.x` or higher.
* **Verification Command:** `node --version`

### 2. Rust Toolchain
Quantum relies on Rust for core systems like file-system operations and terminal PTY management.
* **Required Version:** Rust stable `1.77` or higher.
* **Verification Command:** `rustc --version`
* **Installation:** Install via `rustup` from [rustup.rs](https://rustup.rs/).

### 3. WebView Runtime (Windows)
Tauri uses the system WebView to render the React user interface.
* **Windows:** WebView2 is preinstalled on Windows 10 and 11. If missing, download it from Microsoft's WebView2 installer page.
* **Linux/macOS:** Built-in web engines (WebKitGTK / WebKit) are used and will be configured automatically by Tauri during compilation.

---

## 2. Installation & Quick Start

Follow these steps to clone and initialize the IDE repository:

```bash
# 1. Clone the repository
git clone https://github.com/user-sb737/Code-editor.git
cd Code-editor

# 2. Install dependencies
npm install

# 3. Launch Quantum in Tauri development mode
npm run tauri dev
```

The command `npm run tauri dev` starts a local Vite development server at `http://localhost:1420` and spawns a native Tauri desktop window configured to load the dev URL.

---

## 3. Development Scripts Reference

Quantum provides a variety of npm scripts for development, checking, and testing:

| Script | Command | Purpose |
| :--- | :--- | :--- |
| `dev` | `vite` | Starts the Vite dev server for browser-only development (no PTY/Tauri APIs) |
| `tauri dev` | `tauri dev` | Starts Vite server and runs the Tauri desktop window shell |
| `build` | `npm run typecheck && npm run copy-pyright && vite build` | Generates frontend bundle and bundles the first-party Pyright extension |
| `preview` | `vite preview` | Previews the compiled frontend production bundle locally |
| `typecheck` | `tsc --noEmit -p tsconfig.app.json` | Runs TypeScript compilation check on workspace |
| `lint` | `eslint .` | Runs ESLint for syntax, code quality, and formatting rules |
| `test` | `vitest run` | Runs the Vitest unit test suite |
| `test:watch` | `vitest` | Runs the Vitest suite in watch mode |
| `check` | `npm run typecheck && npm run test` | Combined typecheck and unit testing suite |
| `copy-pyright` | `node scripts/copy-pyright.cjs` | Copies the Pyright LSP langserver bundle into the production distribution |

---

## 4. Compiling Production Builds

To package Quantum IDE into a standalone installer or executable for your platform, run:

```bash
npm run tauri build
```

### Build Artifacts
Tauri compiles the Rust code with optimizations and bundles the React frontend. The compiled packages are placed in:
```
src-tauri/target/release/bundle/
```
Depending on your platform, this directory will contain:
* **Windows:** `.msi` and `.exe` installer packages.
* **macOS:** `.app` bundle and `.dmg` disc image.
* **Linux:** `.deb` package and `AppImage`.

---

## 5. Troubleshooting Common Issues

### Issue: Tauri fails to start or complains of missing headers / libraries (Linux)
* **Reason:** Missing Linux native development libraries needed by Tauri.
* **Solution:** Install the required dependencies using your package manager. For example on Ubuntu/Debian:
  ```bash
  sudo apt-get update
  sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
  ```

### Issue: "Could not find cargo / rustc" during npm run tauri dev
* **Reason:** Rust is either not installed or its executable paths are not in your environment variables.
* **Solution:** Ensure your command prompt shell has been restarted after running the `rustup` script. You can verify if `cargo` is working by running `cargo --version`.

### Issue: Blank screen in the application window
* **Reason:** The web views may have crashed, or Vite did not start properly before the Tauri shell launched.
* **Solution:** Check the console outputs of the terminal where you ran `npm run tauri dev`. If it compiled successfully, try closing the window and running `npm run tauri dev` again.
