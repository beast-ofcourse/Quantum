import type { Language } from "./types";

interface BuiltCommand {
  command: string;
  args: string[];
}

// C/C++ need compile step first, then run the binary
function buildCCommand(file: string, compiler: string): BuiltCommand[] {
  const out = file.replace(/\.(c|cpp|cc|cxx)$/, "");
  return [
    { command: compiler, args: [file, "-o", out] },
    { command: out, args: [] },
  ];
}

// Rust — cargo run in workspace
function buildRustCommand(_file: string): BuiltCommand[] {
  return [{ command: "cargo", args: ["run"] }];
}

// Java — compile then run
function buildJavaCommand(file: string): BuiltCommand[] {
  // file = Foo.java → class Foo
  const name = file.split(/[/\\]/).pop()?.replace(/\.java$/, "") ?? "Main";
  return [
    { command: "javac", args: [file] },
    { command: "java", args: [name] },
  ];
}

export function buildCommand(language: Language, file: string): BuiltCommand[] {
  switch (language) {
    case "c":
      return buildCCommand(file, "gcc");
    case "cpp":
      return buildCCommand(file, "g++");
    case "rust":
      return buildRustCommand(file);
    case "java":
      return buildJavaCommand(file);
    default:
      // interpreted languages — single command
      return [{ command: "", args: [] }];
  }
}
