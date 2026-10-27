import { describe, expect, it } from "bun:test";

import { addScopeEmoji, addScopeEmojiToNewest } from "./add-scope-emoji.mjs";

const manifest = {
  scopes: {
    editor: { emoji: "📝", description: "Editor" },
    "project-tree": {
      emoji: "🌳",
      description: "Tree",
      aliases: ["tree"],
    },
    "cloud-sync": { emoji: "☁️", description: "Cloud Sync" },
  },
};

const notes = [
  "### Features",
  "",
  "* **editor:** keep the cursor ([#1](https://example.com/1)) ([abc1234](https://example.com/c))",
  "* **tree:** keep the order",
  "* **cloud-sync:** retry uploads",
  "* **unlisted:** something else",
  "* an entry without a scope",
  "- **editor:** a dash bullet",
  "",
  "Text that mentions **editor:** in passing.",
].join("\n");

describe("addScopeEmoji", () => {
  it("puts the scope's emoji in front of each scoped entry", () => {
    expect(addScopeEmoji(notes, manifest)).toBe(
      [
        "### Features",
        "",
        "* 📝 **editor:** keep the cursor ([#1](https://example.com/1)) ([abc1234](https://example.com/c))",
        "* 🌳 **tree:** keep the order",
        "* ☁️ **cloud-sync:** retry uploads",
        "* **unlisted:** something else",
        "* an entry without a scope",
        "- 📝 **editor:** a dash bullet",
        "",
        "Text that mentions **editor:** in passing.",
      ].join("\n"),
    );
  });

  it("changes nothing when run again", () => {
    const once = addScopeEmoji(notes, manifest);
    expect(addScopeEmoji(once, manifest)).toBe(once);
  });

  it("replaces an emoji the scope no longer uses", () => {
    expect(addScopeEmoji("* 🔧 **editor:** fix", manifest)).toBe(
      "* 📝 **editor:** fix",
    );
  });
});

describe("addScopeEmojiToNewest", () => {
  it("changes only the newest release section", () => {
    const changelog = [
      "# Changelog",
      "",
      "* **editor:** not a release",
      "",
      "## [1.0.1](https://example.com/compare) (2026-10-28)",
      "",
      "* **editor:** new",
      "",
      "## [1.0.0](https://example.com/compare) (2026-10-20)",
      "",
      "* **editor:** old",
      "",
    ].join("\n");
    expect(addScopeEmojiToNewest(changelog, manifest)).toBe(
      changelog.replace("* **editor:** new", "* 📝 **editor:** new"),
    );
  });

  it("leaves a changelog without releases alone", () => {
    expect(addScopeEmojiToNewest("# Changelog\n", manifest)).toBe(
      "# Changelog\n",
    );
  });
});
