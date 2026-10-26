#!/usr/bin/env node
/**
 * Check a PR title's Conventional Commit scope against the approved list in
 * `.github/commit-scopes.json`, or check that list itself.
 *
 *   PR_TITLE="fix(editor): …" node scripts/check-pr-title.mjs [--scopes <file>]
 *   node scripts/check-pr-title.mjs --check-manifest
 *
 * The type and subject are checked by action-semantic-pull-request in
 * validate-pr-title.yml; this only checks the scope, which is optional. The
 * manifest check runs in CI's unit tests (scripts/check-pr-title.test.mjs)
 * and makes sure every icon exists in Material Symbols, since the in-app
 * changelog shows it.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_MANIFEST_PATH = join(
  repoRoot,
  ".github/commit-scopes.json",
);
export const ICON_DIR = join(
  repoRoot,
  "frontend/node_modules/@material-symbols/svg-400/outlined",
);

const SCOPE_NAME = /^[a-z][\da-z]*(?:-[\da-z]+)*$/;
const ICON_NAME = /^[\da-z_]+$/;
const TITLE_SCOPE = /^[a-z]+\(([^)]*)\)!?:/;

/** The scope of a Conventional Commit title, or null when it has none. */
export function parseScope(title) {
  const match = TITLE_SCOPE.exec(title.trim());
  return match ? match[1] : null;
}

/** Map every alias to the scope it stands for. */
function aliasMap(manifest) {
  const aliases = new Map();
  for (const [scope, entry] of Object.entries(manifest.scopes)) {
    for (const alias of entry.aliases ?? []) aliases.set(alias, scope);
  }
  return aliases;
}

/**
 * Check a PR title's scope. Returns null when it is fine, or the error
 * message to show.
 */
export function checkTitle(title, manifest) {
  const scope = parseScope(title);
  if (scope === null || Object.hasOwn(manifest.scopes, scope)) return null;

  const lines = [
    `The scope "${scope}" in "${title}" is not an approved scope.`,
  ];
  const suggestion = aliasMap(manifest).get(scope);
  if (suggestion) {
    lines.push(`Use "${suggestion}" instead.`);
  } else if (scope.includes(",")) {
    lines.push("Use a single scope.");
  }
  lines.push(
    "",
    "Approved scopes (or leave the scope out):",
    ...Object.entries(manifest.scopes).map(
      ([name, entry]) => `  ${name.padEnd(14)} ${entry.description}`,
    ),
    "",
    "A new area of the app? Add its scope to .github/commit-scopes.json in this PR.",
  );
  return lines.join("\n");
}

/**
 * Check the manifest's shape. With `iconDir`, also check that each icon is a
 * Material Symbols icon. Returns the list of problems (empty when valid).
 */
export function validateManifest(manifest, iconDir) {
  const errors = [];
  if (!manifest?.scopes || typeof manifest.scopes !== "object") {
    return ['The manifest must have a "scopes" object.'];
  }
  const seen = new Map();
  for (const [scope, entry] of Object.entries(manifest.scopes)) {
    if (!SCOPE_NAME.test(scope)) {
      errors.push(`Scope "${scope}" must be lowercase kebab-case.`);
    }
    if (typeof entry.description !== "string" || entry.description === "") {
      errors.push(`Scope "${scope}" needs a description.`);
    }
    if (typeof entry.icon !== "string" || !ICON_NAME.test(entry.icon)) {
      errors.push(`Scope "${scope}" needs a Material Symbols icon name.`);
    } else if (iconDir && !existsSync(join(iconDir, `${entry.icon}.svg`))) {
      errors.push(
        `Scope "${scope}" uses icon "${entry.icon}", which is not in Material Symbols.`,
      );
    }
    for (const alias of entry.aliases ?? []) {
      if (Object.hasOwn(manifest.scopes, alias)) {
        errors.push(`Alias "${alias}" of "${scope}" is itself a scope.`);
      } else if (seen.has(alias)) {
        errors.push(
          `Alias "${alias}" is listed under both "${seen.get(alias)}" and "${scope}".`,
        );
      }
      seen.set(alias, scope);
    }
  }
  return errors;
}

export function readManifest(path = DEFAULT_MANIFEST_PATH) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function main(argv) {
  const scopesFlag = argv.indexOf("--scopes");
  const manifestPath =
    scopesFlag === -1 ? DEFAULT_MANIFEST_PATH : resolve(argv[scopesFlag + 1]);
  const manifest = readManifest(manifestPath);

  if (argv.includes("--check-manifest")) {
    const errors = validateManifest(manifest, ICON_DIR);
    if (errors.length > 0) {
      console.error(errors.join("\n"));
      process.exit(1);
    }
    console.log(
      `${Object.keys(manifest.scopes).length} approved scopes are valid.`,
    );
    return;
  }

  // The manifest comes from the PR head in CI, so check it before trusting it.
  const errors = validateManifest(manifest);
  if (errors.length > 0) {
    console.error(`${manifestPath} is invalid:\n${errors.join("\n")}`);
    process.exit(1);
  }
  const title = process.env.PR_TITLE ?? "";
  const error = checkTitle(title, manifest);
  if (error) {
    console.error(error);
    process.exit(1);
  }
  const scope = parseScope(title);
  console.log(
    scope ? `Scope "${scope}" is approved.` : "No scope; nothing to check.",
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main(process.argv.slice(2));
}
