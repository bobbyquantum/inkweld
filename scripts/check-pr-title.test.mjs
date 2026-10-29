import { describe, expect, it } from "bun:test";

import {
  checkTitle,
  parseScope,
  readManifest,
  validateManifest,
} from "./check-pr-title.mjs";

const manifest = {
  scopes: {
    editor: { emoji: "📝", description: "Editor", aliases: ["toolbar"] },
    "project-tree": {
      emoji: "🌳",
      description: "Tree",
      aliases: ["tree"],
    },
  },
};

describe("parseScope", () => {
  it("reads the scope", () => {
    expect(parseScope("fix(editor): keep the cursor")).toBe("editor");
    expect(parseScope("feat(project-tree)!: drop folders")).toBe(
      "project-tree",
    );
  });

  it("returns null without a scope", () => {
    expect(parseScope("fix: keep the cursor")).toBeNull();
    expect(parseScope("feat!: drop folders")).toBeNull();
  });
});

describe("checkTitle", () => {
  it("accepts approved scopes and titles without one", () => {
    expect(checkTitle("fix(editor): keep the cursor", manifest)).toBeNull();
    expect(checkTitle("chore: tidy up", manifest)).toBeNull();
  });

  it("rejects an unknown scope and lists the approved ones", () => {
    const error = checkTitle("fix(frontend): keep the cursor", manifest);
    expect(error).toContain('"frontend"');
    expect(error).toContain("project-tree");
    expect(error).toContain(".github/commit-scopes.json");
  });

  it("suggests the approved scope for an alias", () => {
    expect(checkTitle("fix(tree): keep order", manifest)).toContain(
      'Use "project-tree" instead.',
    );
  });

  it("rejects several scopes", () => {
    expect(checkTitle("fix(editor,tree): keep order", manifest)).toContain(
      "Use a single scope.",
    );
  });
});

describe("validateManifest", () => {
  it("accepts a valid manifest", () => {
    expect(validateManifest(manifest)).toEqual([]);
  });

  it("reports bad names, missing fields and alias clashes", () => {
    const errors = validateManifest({
      scopes: {
        Editor: { emoji: "📝", description: "Editor" },
        sync: { emoji: "🔄🔄", description: "", aliases: ["tree", "Editor"] },
        tree2: { emoji: "📝", description: "Tree", aliases: ["tree"] },
        tree3: { emoji: "☁️", description: "Tree" },
      },
    });
    expect(errors).toEqual([
      'Scope "Editor" must be lowercase kebab-case.',
      'Scope "sync" needs a description.',
      'Scope "sync" needs a single emoji.',
      'Alias "Editor" of "sync" is itself a scope.',
      'Scopes "Editor" and "tree2" share the emoji 📝.',
      'Alias "tree" is listed under both "sync" and "tree2".',
    ]);
  });

  it("rejects a manifest without scopes", () => {
    expect(validateManifest({})).toEqual([
      'The manifest must have a "scopes" object.',
    ]);
  });

  it("accepts the checked-in manifest", () => {
    expect(validateManifest(readManifest())).toEqual([]);
  });

  it("approves the scope Renovate uses", () => {
    expect(
      checkTitle("chore(deps): update dependency x to v2", readManifest()),
    ).toBeNull();
  });
});
