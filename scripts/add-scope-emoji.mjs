#!/usr/bin/env node
/**
 * Put each approved scope's emoji (`.github/commit-scopes.json`) in front of
 * its release-please entries: `* **editor:** …` becomes `* 📝 **editor:** …`.
 *
 *   node scripts/add-scope-emoji.mjs --changelog CHANGELOG.md
 *   node scripts/add-scope-emoji.mjs --notes release-pr-body.md
 *
 * release-please has no option for this, so release-please.yml runs it on
 * the release PR after every update: `--changelog` changes only the newest
 * release section (older releases keep the emoji they shipped with), and
 * `--notes` the whole file (the PR body, which release-please turns into the
 * GitHub release notes when the PR is merged). Running it again changes
 * nothing.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { aliasMap, readManifest } from "./check-pr-title.mjs";

// A list item with a release-please scope, after any emoji already added.
const SCOPED_ENTRY =
  /^(\s*[*-] )(?:\p{Extended_Pictographic}\uFE0F? )?(\*\*([\da-z-]+):\*\*)/gmu;

/** Map each scope and alias to its emoji. */
export function emojiMap(manifest) {
  const emoji = new Map();
  for (const [alias, scope] of aliasMap(manifest)) {
    emoji.set(alias, manifest.scopes[scope].emoji);
  }
  for (const [scope, entry] of Object.entries(manifest.scopes)) {
    emoji.set(scope, entry.emoji);
  }
  return emoji;
}

/** Add the scope emoji to every scoped entry in `markdown`. */
export function addScopeEmoji(markdown, manifest) {
  const emoji = emojiMap(manifest);
  return markdown.replaceAll(SCOPED_ENTRY, (entry, bullet, label, scope) =>
    emoji.has(scope) ? `${bullet}${emoji.get(scope)} ${label}` : entry,
  );
}

/** Add the scope emoji to the newest `## ` release section of a changelog. */
export function addScopeEmojiToNewest(changelog, manifest) {
  const start = changelog.search(/^## /m);
  if (start === -1) return changelog;
  const rest = changelog.slice(start + 3);
  const next = rest.search(/^## /m);
  const end = next === -1 ? changelog.length : start + 3 + next;
  return (
    changelog.slice(0, start) +
    addScopeEmoji(changelog.slice(start, end), manifest) +
    changelog.slice(end)
  );
}

function rewrite(path, transform) {
  const before = readFileSync(path, "utf8");
  const after = transform(before);
  if (after !== before) writeFileSync(path, after);
  console.log(
    `${path}: ${after === before ? "unchanged" : "scope emoji added"}`,
  );
}

function main(argv) {
  const manifest = readManifest();
  const changelog = argv.indexOf("--changelog");
  const notes = argv.indexOf("--notes");
  if (changelog === -1 && notes === -1) {
    console.error(
      "Usage: add-scope-emoji.mjs --changelog <file> | --notes <file>",
    );
    process.exit(1);
  }
  if (changelog !== -1) {
    rewrite(resolve(argv[changelog + 1]), (text) =>
      addScopeEmojiToNewest(text, manifest),
    );
  }
  if (notes !== -1) {
    rewrite(resolve(argv[notes + 1]), (text) => addScopeEmoji(text, manifest));
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main(process.argv.slice(2));
}
