import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import {
  IS_WINDOWS,
  getSharedDir,
  getSharedCacheDir,
  getTempDir,
  toForwardSlash,
} from "../lib/platform.mjs";

// ---------------------------------------------------------------------------
// IS_WINDOWS
// ---------------------------------------------------------------------------

describe("IS_WINDOWS", () => {
  it("is a boolean", () => {
    assert.equal(typeof IS_WINDOWS, "boolean");
  });

  it("matches process.platform check", () => {
    assert.equal(IS_WINDOWS, process.platform === "win32");
  });
});

// ---------------------------------------------------------------------------
// getSharedDir
// ---------------------------------------------------------------------------

describe("getSharedDir", () => {
  it("returns a non-empty string", () => {
    const dir = getSharedDir();
    assert.ok(typeof dir === "string" && dir.length > 0);
  });

  it("ends with backlog-setup", () => {
    const dir = getSharedDir();
    assert.ok(
      dir.endsWith("backlog-setup"),
      `Expected ${dir} to end with 'backlog-setup'`
    );
  });

  it("contains homedir or LOCALAPPDATA", () => {
    const dir = getSharedDir();
    if (IS_WINDOWS) {
      const localAppData = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
      assert.ok(dir.startsWith(localAppData), `Expected ${dir} to start with ${localAppData}`);
    } else {
      assert.ok(dir.startsWith(homedir()), `Expected ${dir} to start with ${homedir()}`);
      assert.ok(dir.includes(".local/share"), `Expected ${dir} to include '.local/share'`);
    }
  });
});

// ---------------------------------------------------------------------------
// getSharedCacheDir
// ---------------------------------------------------------------------------

describe("getSharedCacheDir", () => {
  it("returns a non-empty string", () => {
    const dir = getSharedCacheDir();
    assert.ok(typeof dir === "string" && dir.length > 0);
  });

  it("contains mcp-local-rag-models", () => {
    const dir = getSharedCacheDir();
    assert.ok(
      dir.includes("mcp-local-rag-models"),
      `Expected ${dir} to include 'mcp-local-rag-models'`
    );
  });
});

// ---------------------------------------------------------------------------
// getTempDir
// ---------------------------------------------------------------------------

describe("getTempDir", () => {
  it("returns the os tmpdir", () => {
    assert.equal(getTempDir(), tmpdir());
  });
});

// ---------------------------------------------------------------------------
// toForwardSlash
// ---------------------------------------------------------------------------

describe("toForwardSlash", () => {
  it("converts backslashes to forward slashes", () => {
    assert.equal(toForwardSlash("C:\\Users\\foo\\bar"), "C:/Users/foo/bar");
  });

  it("leaves forward slashes unchanged", () => {
    assert.equal(toForwardSlash("/home/user/project"), "/home/user/project");
  });

  it("handles mixed separators", () => {
    assert.equal(toForwardSlash("C:\\Users/foo\\bar"), "C:/Users/foo/bar");
  });

  it("handles empty string", () => {
    assert.equal(toForwardSlash(""), "");
  });

  it("handles Windows UNC paths", () => {
    assert.equal(
      toForwardSlash("\\\\server\\share\\file"),
      "//server/share/file"
    );
  });
});
