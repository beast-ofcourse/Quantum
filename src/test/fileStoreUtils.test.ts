import { describe, it, expect } from "vitest";
import {
  detectSeparator,
  joinPath,
  parentPath,
  basename,
  validateName,
  findCommonParent,
} from "@/lib/pathUtils";

describe("detectSeparator", () => {
  it("returns / for Unix paths", () => {
    expect(detectSeparator("/home/user/file.ts")).toBe("/");
  });

  it("returns \\ for Windows paths", () => {
    expect(detectSeparator("C:\\Users\\file.ts")).toBe("\\");
  });

  it("returns / for paths with mixed separators", () => {
    expect(detectSeparator("C:\\Users/foo/file.ts")).toBe("/");
  });

  it("returns / for relative Unix paths", () => {
    expect(detectSeparator("src/file.ts")).toBe("/");
  });
});

describe("joinPath", () => {
  it("joins Unix paths", () => {
    expect(joinPath("/home/user", "file.ts")).toBe("/home/user/file.ts");
  });

  it("joins Windows paths", () => {
    expect(joinPath("C:\\Users", "file.ts")).toBe("C:\\Users\\file.ts");
  });

  it("strips trailing separator from parent", () => {
    expect(joinPath("/home/user/", "file.ts")).toBe("/home/user/file.ts");
  });

  it("joins Unix paths with backslash parent", () => {
    expect(joinPath("/home/user\\", "file.ts")).toBe("/home/user/file.ts");
  });
});

describe("parentPath", () => {
  it("returns parent for Unix path", () => {
    expect(parentPath("/home/user/file.ts")).toBe("/home/user");
  });

  it("returns parent for Windows path", () => {
    expect(parentPath("C:\\Users\\file.ts")).toBe("C:\\Users");
  });

  it("returns null for root Unix path", () => {
    expect(parentPath("/")).toBeNull();
  });

  it("returns null for a filename without directory", () => {
    expect(parentPath("file.ts")).toBeNull();
  });

  it("returns null for Windows drive root", () => {
    expect(parentPath("C:\\")).toBeNull();
  });

  it("handles deep nested paths", () => {
    expect(parentPath("/a/b/c/d/e/f.ts")).toBe("/a/b/c/d/e");
  });
});

describe("basename", () => {
  it("returns filename from Unix path", () => {
    expect(basename("/home/user/file.ts")).toBe("file.ts");
  });

  it("returns filename from Windows path", () => {
    expect(basename("C:\\Users\\file.ts")).toBe("file.ts");
  });

  it("returns the path itself when no separator", () => {
    expect(basename("file.ts")).toBe("file.ts");
  });

  it("returns last directory name", () => {
    expect(basename("/home/user/")).toBe("");
  });
});

describe("validateName", () => {
  it("accepts valid names", () => {
    expect(() => validateName("file.ts")).not.toThrow();
    expect(() => validateName("my-file")).not.toThrow();
    expect(() => validateName("hello_world")).not.toThrow();
  });

  it("rejects empty string", () => {
    expect(() => validateName("")).toThrow("Invalid name");
  });

  it("rejects dot", () => {
    expect(() => validateName(".")).toThrow("Invalid name");
  });

  it("rejects dot dot", () => {
    expect(() => validateName("..")).toThrow("Invalid name");
  });

  it("rejects names with forward slash", () => {
    expect(() => validateName("a/b")).toThrow("path separators");
  });

  it("rejects names with backslash", () => {
    expect(() => validateName("a\\b")).toThrow("path separators");
  });

  it("rejects names with NUL character", () => {
    expect(() => validateName("a\0b")).toThrow("path separators");
  });
});

describe("findCommonParent", () => {
  it("returns null for empty array", () => {
    expect(findCommonParent([])).toBeNull();
  });

  it("returns parent of a single file", () => {
    expect(findCommonParent(["/home/user/file.ts"])).toBe("/home/user");
  });

  it("returns the parent of a single directory path (drops last segment)", () => {
    expect(findCommonParent(["/home/user"])).toBe("/home");
  });

  it("finds common parent for multiple files in same directory", () => {
    const result = findCommonParent(["/home/user/a.ts", "/home/user/b.ts"]);
    expect(result).toBe("/home/user");
  });

  it("finds common ancestor for files in nested directories", () => {
    const result = findCommonParent([
      "/home/user/project/src/a.ts",
      "/home/user/project/docs/b.md",
    ]);
    expect(result).toBe("/home/user/project");
  });

  it("returns null when there is no common prefix", () => {
    const result = findCommonParent(["/home/user/a.ts", "/var/log/b.log"]);
    expect(result).toBeNull();
  });

  it("handles Windows paths", () => {
    const result = findCommonParent([
      "C:\\Users\\project\\src\\a.ts",
      "C:\\Users\\project\\docs\\b.md",
    ]);
    expect(result).toBe("C:\\Users\\project");
  });

  it("handles a mix of related paths", () => {
    const result = findCommonParent(["/a/b/c/d", "/a/b/c/e", "/a/b/c/f/g"]);
    expect(result).toBe("/a/b/c");
  });
});
