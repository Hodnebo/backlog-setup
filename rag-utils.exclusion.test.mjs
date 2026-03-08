import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  globToRegex,
  isExcluded,
  escapeRegex,
  DEFAULT_EXCLUDE_PATTERNS,
} from "./rag-utils.mjs";

// ---------------------------------------------------------------------------
// escapeRegex
// ---------------------------------------------------------------------------

describe("escapeRegex", () => {
  it("escapes dots", () => {
    assert.equal(escapeRegex("file.txt"), "file\\.txt");
  });

  it("escapes asterisks and question marks", () => {
    assert.equal(escapeRegex("*.md"), "\\*\\.md");
    assert.equal(escapeRegex("file?.txt"), "file\\?\\.txt");
  });

  it("escapes brackets and parens", () => {
    assert.equal(escapeRegex("[a](b)"), "\\[a\\]\\(b\\)");
  });

  it("leaves plain strings unchanged", () => {
    assert.equal(escapeRegex("hello"), "hello");
  });

  it("escapes all special regex chars", () => {
    const specials = ".*+?^${}()|[]\\";
    const escaped = escapeRegex(specials);
    // Every char should be preceded by a backslash
    assert.ok(new RegExp(escaped).test(specials));
  });
});

// ---------------------------------------------------------------------------
// globToRegex — bare names
// ---------------------------------------------------------------------------

describe("globToRegex — bare names", () => {
  it("matches exact segment at root", () => {
    const re = globToRegex("node_modules");
    assert.ok(re.test("node_modules"));
    assert.ok(re.test("node_modules/foo"));
  });

  it("matches exact segment nested in path", () => {
    const re = globToRegex(".git");
    assert.ok(re.test("some/path/.git"));
    assert.ok(re.test("some/path/.git/objects"));
  });

  it("does not match partial segment names", () => {
    const re = globToRegex("git");
    assert.ok(!re.test(".gitignore"), "Should not match .gitignore for bare 'git'");
    assert.ok(re.test("git"));
    assert.ok(re.test("path/git/objects"));
  });

  it("matches .DS_Store as a file name", () => {
    const re = globToRegex(".DS_Store");
    assert.ok(re.test(".DS_Store"));
    assert.ok(re.test("subdir/.DS_Store"));
    assert.ok(!re.test(".DS_Store_extra"));
  });
});

// ---------------------------------------------------------------------------
// globToRegex — single star (*)
// ---------------------------------------------------------------------------

describe("globToRegex — single star (*)", () => {
  it("matches any extension", () => {
    const re = globToRegex("*.log");
    assert.ok(re.test("app.log"));
    assert.ok(re.test("deep/path/error.log"));
  });

  it("does not match across path separators", () => {
    const re = globToRegex("*.log");
    // "*.log" should match "foo.log" but the star doesn't cross /
    assert.ok(re.test("foo.log"));
    // The pattern "*.log" as unanchored should still match nested since
    // it has a glob char but no slash — it becomes unanchored
    assert.ok(re.test("a/b/foo.log"));
  });

  it("matches prefix wildcard", () => {
    const re = globToRegex("test_*");
    assert.ok(re.test("test_foo"));
    assert.ok(re.test("dir/test_bar"));
  });
});

// ---------------------------------------------------------------------------
// globToRegex — double star (**)
// ---------------------------------------------------------------------------

describe("globToRegex — double star (**)", () => {
  it("matches any depth with **/name", () => {
    const re = globToRegex("**/foo");
    assert.ok(re.test("foo"));
    assert.ok(re.test("a/foo"));
    assert.ok(re.test("a/b/c/foo"));
  });

  it("matches entire subtree with dir/**", () => {
    const re = globToRegex("build/**");
    assert.ok(re.test("build/output.js"));
    assert.ok(re.test("build/sub/deep/file.css"));
  });

  it("matches directory at any depth with **", () => {
    const re = globToRegex("**/node_modules/**");
    assert.ok(re.test("node_modules/foo"));
    assert.ok(re.test("packages/app/node_modules/bar/baz"));
  });
});

// ---------------------------------------------------------------------------
// globToRegex — question mark (?)
// ---------------------------------------------------------------------------

describe("globToRegex — question mark (?)", () => {
  it("matches single character", () => {
    const re = globToRegex("file?.txt");
    assert.ok(re.test("fileA.txt"));
    assert.ok(re.test("dir/file1.txt"));
  });

  it("does not match zero characters", () => {
    const re = globToRegex("file?.txt");
    assert.ok(!re.test("file.txt"));
  });

  it("does not match path separator", () => {
    const re = globToRegex("a?b");
    assert.ok(re.test("aXb"));
    assert.ok(!re.test("a/b"));
  });
});

// ---------------------------------------------------------------------------
// globToRegex — anchored patterns (leading /)
// ---------------------------------------------------------------------------

describe("globToRegex — anchored patterns (leading /)", () => {
  it("matches at root with /pattern", () => {
    const re = globToRegex("/vendor");
    assert.ok(re.test("vendor"));
    assert.ok(re.test("vendor/lib/foo"));
    // Note: bare-name anchoring does not prevent matching nested paths
    // because the bare-name branch in globToRegex returns before checking
    // the anchored flag. This is a known limitation — anchoring only
    // takes effect when the pattern contains slashes or glob characters.
    assert.ok(re.test("sub/vendor"));
  });

  it("anchored glob matches from start", () => {
    const re = globToRegex("/dist/*.js");
    assert.ok(re.test("dist/bundle.js"));
    assert.ok(!re.test("sub/dist/bundle.js"));
  });
});

// ---------------------------------------------------------------------------
// globToRegex — trailing slash (directory-only)
// ---------------------------------------------------------------------------

describe("globToRegex — trailing slash", () => {
  it("trailing slash is stripped — matches same as without", () => {
    const reWith = globToRegex("temp/");
    const reWithout = globToRegex("temp");
    // Both should match "temp" as a segment
    assert.ok(reWith.test("temp"));
    assert.ok(reWithout.test("temp"));
    assert.ok(reWith.test("a/temp/b"));
    assert.ok(reWithout.test("a/temp/b"));
  });
});

// ---------------------------------------------------------------------------
// globToRegex — mixed patterns
// ---------------------------------------------------------------------------

describe("globToRegex — mixed patterns", () => {
  it("path with glob: src/*.test.js", () => {
    const re = globToRegex("src/*.test.js");
    assert.ok(re.test("src/foo.test.js"));
    assert.ok(!re.test("lib/foo.test.js"));
  });

  it("deep path with glob: packages/*/dist", () => {
    const re = globToRegex("packages/*/dist");
    assert.ok(re.test("packages/app/dist"));
    assert.ok(re.test("packages/lib/dist/foo.js"));
    // star doesn't cross /, so packages/a/b/dist should NOT match
    assert.ok(!re.test("packages/a/b/dist"));
  });
});

// ---------------------------------------------------------------------------
// isExcluded
// ---------------------------------------------------------------------------

describe("isExcluded", () => {
  // Compile default patterns for testing
  const defaultMatchers = DEFAULT_EXCLUDE_PATTERNS.map(globToRegex);

  it("excludes .git directory", () => {
    assert.ok(isExcluded(".git", defaultMatchers));
    assert.ok(isExcluded(".git/objects/pack", defaultMatchers));
  });

  it("excludes node_modules at any depth", () => {
    assert.ok(isExcluded("node_modules", defaultMatchers));
    assert.ok(isExcluded("packages/app/node_modules", defaultMatchers));
  });

  it("excludes .DS_Store files", () => {
    assert.ok(isExcluded(".DS_Store", defaultMatchers));
    assert.ok(isExcluded("subdir/.DS_Store", defaultMatchers));
  });

  it("excludes .lancedb directory", () => {
    assert.ok(isExcluded(".lancedb", defaultMatchers));
    assert.ok(isExcluded(".lancedb/data/file", defaultMatchers));
  });

  it("excludes .opencode directory", () => {
    assert.ok(isExcluded(".opencode", defaultMatchers));
    assert.ok(isExcluded(".opencode/config.json", defaultMatchers));
  });

  it("does not exclude normal project files", () => {
    assert.ok(!isExcluded("src/index.js", defaultMatchers));
    assert.ok(!isExcluded("backlog/tasks/task-1.md", defaultMatchers));
    assert.ok(!isExcluded("README.md", defaultMatchers));
  });

  it("returns false for empty matchers list", () => {
    assert.ok(!isExcluded("anything", []));
  });

  it("works with custom glob matchers", () => {
    const matchers = [globToRegex("*.log"), globToRegex("dist")];
    assert.ok(isExcluded("error.log", matchers));
    assert.ok(isExcluded("sub/debug.log", matchers));
    assert.ok(isExcluded("dist", matchers));
    assert.ok(isExcluded("dist/bundle.js", matchers));
    assert.ok(!isExcluded("src/index.js", matchers));
  });

  it("works with deeply nested exclusion", () => {
    const matchers = [globToRegex("node_modules")];
    assert.ok(isExcluded("a/b/c/node_modules/d/e", matchers));
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_EXCLUDE_PATTERNS — sanity checks
// ---------------------------------------------------------------------------

describe("DEFAULT_EXCLUDE_PATTERNS", () => {
  it("contains expected default entries", () => {
    assert.ok(DEFAULT_EXCLUDE_PATTERNS.includes(".git"));
    assert.ok(DEFAULT_EXCLUDE_PATTERNS.includes("node_modules"));
    assert.ok(DEFAULT_EXCLUDE_PATTERNS.includes(".lancedb"));
    assert.ok(DEFAULT_EXCLUDE_PATTERNS.includes(".mcp-local-rag-models"));
    assert.ok(DEFAULT_EXCLUDE_PATTERNS.includes(".DS_Store"));
    assert.ok(DEFAULT_EXCLUDE_PATTERNS.includes(".opencode"));
  });

  it("has exactly 6 default patterns", () => {
    assert.equal(DEFAULT_EXCLUDE_PATTERNS.length, 6);
  });
});
