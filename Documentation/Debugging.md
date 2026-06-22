# Debugging & DAP Integration

Quantum IDE comes equipped with a built-in client for the **Debug Adapter Protocol (DAP)**, the same protocol used by VS Code. This allows Quantum to communicate with external debugger engines (such as Node.js debugger, Python debugpy, or C++ lldb/gdb) through standard communication pipes, offering a robust debugging environment.

---

## 1. DAP Architecture

The Debug Adapter Protocol decouples the editor front-end from the execution engine:

```
+--------------------+           Tauri IPC            +--------------------+
|  React UI Panels   | <============================> | Tauri Rust Backend |
| (Stack, Variables) |                                |   (DAP Client)     |
+--------------------+                                +--------------------+
                                                                ||
                                                         stdin / stdout / TCP
                                                                ||
                                                                \/
                                                      +--------------------+
                                                      |  Debug Adapter     |
                                                      | (debugpy, node)    |
                                                      +--------------------+
                                                                ||
                                                                \/
                                                      +--------------------+
                                                      |   Running App      |
                                                      +--------------------+
```

1. **The User UI:** You toggle breakpoints, trigger step commands, and inspect scope values in the React sidebar.
2. **The Tauri Backend:** Acts as the DAP Client. It launches the debug adapter process, manages communication over standard inputs/outputs or TCP sockets, and forwards debugger events (such as paused, stopped, or output log notifications) to the frontend.
3. **The Debug Adapter:** A standalone language-specific program that coordinates directly with the running application.

---

## 2. Launch Configurations (`launch.json`)

To debug an application, Quantum looks for configurations inside the `.quantum/launch.json` file.

### Adding Configurations
* **Visual Editor:** Click **Add Configuration** in the Run & Debug panel. Quantum opens a dialog where you can select the environment type (e.g., Node.js, Python, Chrome) and fill in options.
* **Direct Edit:** Edit the JSON file directly. The editor provides autocomplete schema guides for known types.

### Example `launch.json`
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Launch Program",
      "program": "${workspaceFolder}/src/main.js",
      "args": ["--verbose"],
      "console": "integratedTerminal"
    },
    {
      "type": "python",
      "request": "launch",
      "name": "Debug Python File",
      "program": "${file}"
    }
  ]
}
```

---

## 3. Debug Controls & Execution

### Execution States
The Run button on the editor toolbar/tab bar changes states based on your debugging session:
* **Idle (▶):** Ready to launch.
* **Running (■):** The target process is running.
* **Paused (■):** Hit a breakpoint. The code execution is frozen, and controls light up.

### Floating Debug Toolbar
When a debugging session is active, a floating action toolbar appears at the top of the editor:
* **Continue (`F5`):** Resume execution until the next breakpoint is hit.
* **Step Over (`F10`):** Execute the next line of code without stepping into functions.
* **Step Into (`F11`):** Step inside the function on the current execution line.
* **Step Out (`Shift+F11`):** Execute the remaining lines of the current function and pause back in the caller.
* **Restart (`Ctrl+Shift+F5`):** Restart the debugger and relaunch the application.
* **Stop (`Shift+F5`):** Terminate the debugging session.

---

## 4. Breakpoints

Quantum supports multiple styles of breakpoints to pause your program:

* **Standard Breakpoints:** Click in the left gutter of Monaco Editor (to the left of line numbers). A red dot appears, indicating a breakpoint is set.
* **Conditional Breakpoints:** Right-click the gutter and select **Add Conditional Breakpoint**. Enter an expression (e.g., `i === 10`). Execution will only pause if the expression evaluates to true.
* **Exception Breakpoints:** Toggle exception breakpoint checkboxes in the Breakpoints sidebar panel (e.g., pause on **All Exceptions** or **Uncaught Exceptions**).

---

## 5. Inspection Panels

When execution is paused, the **Run & Debug Sidebar** (`Ctrl+Shift+D`) displays execution states:

### 1. Variables & Scopes
Inspect variables grouped by their scopes:
* **Local:** Variables declared inside the active function frame.
* **Closure:** Variables accessible via lexical closure contexts.
* **Global:** Global scope variables.
* **Interaction:** Double-click values to edit them on-the-fly during debugging.

### 2. Watch Expressions
Click the **+** button in the Watch panel to monitor specific expressions (e.g., `user.username` or `array.length`). The debugger evaluates these expressions on every step and shows their current values.

### 3. Call Stack
Displays active threads and their stack frames. 
* **Navigation:** Click on any frame in the stack trace to open that file in the editor and view the corresponding execution line.

### 4. Debug Console (REPL)
Located in the Bottom Dock:
* **Output Log:** Streams stdout, stderr, and debugger events.
* **REPL Input:** Type expressions or variable names and hit Enter. The DAP client sends the query to the debugger process, displaying evaluations inline.
