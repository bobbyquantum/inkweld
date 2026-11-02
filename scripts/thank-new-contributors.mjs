#!/usr/bin/env node
/**
 * Thank first-time contributors in a GitHub release's notes.
 *
 *   node scripts/thank-new-contributors.mjs --tag v1.0.0-beta.4
 *   node scripts/thank-new-contributors.mjs --tag v1.0.0-beta.4 --dry-run
 *
 * release-please writes the release notes from Conventional Commit titles,
 * which name no one. GitHub's generate-notes API does know who contributes
 * for the first time, and lists them under `## New Contributors`. This asks it
 * for the notes of `--tag` (the API only returns text, it saves nothing),
 * keeps that one section and appends it to the release with `gh release edit`.
 * What release-please wrote stays as it is, and so does CHANGELOG.md: the
 * thanks only live in the GitHub release.
 *
 * release-please.yml runs it once a release is created. It needs `gh`, a
 * token that can write the repository's contents (GH_TOKEN), and the
 * repository from GITHUB_REPOSITORY or `--repo owner/name`. `--dry-run`
 * prints the section instead of editing the release.
 *
 * - The notes cover the previous release up to `--tag`. The previous release
 *   is the highest version below the tag, prereleases included, and is passed
 *   to the API by name rather than left to GitHub's own pick, which can skip
 *   prereleases (every release so far has been one).
 * - A release that already has a New Contributors section is left alone, so
 *   running it again changes nothing. So is one without first-time
 *   contributors, or without an earlier release to compare with.
 * - Bot accounts such as @dependabot[bot] are not thanked.
 */

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

// semver.org's grammar, with the leading "v" release-please puts in tags.
const VERSION =
  /^v?(\d+)\.(\d+)\.(\d+)(?:-([\dA-Za-z-]+(?:\.[\dA-Za-z-]+)*))?(?:\+[\dA-Za-z-]+(?:\.[\dA-Za-z-]+)*)?$/;
const REPOSITORY = /^[\w.-]+\/[\w.-]+$/;
// The heading of GitHub's section (`## New Contributors`), on a line of its own.
const HEADING = /^#{1,6}[ \t]+New Contributors[ \t]*\r?$/im;
const LIST_ITEM = /^[*-][ \t]/;
// A list item thanking a bot: `* @dependabot[bot] made their first contribution …`
const BOT_ITEM = /^[*-][ \t]+@[^\s[]+\[bot\]/i;

function parseVersion(tag) {
  const match = VERSION.exec(tag);
  if (!match) return null;
  return {
    core: [match[1], match[2], match[3]].map(Number),
    prerelease: match[4] ? match[4].split(".") : [],
  };
}

function requireVersion(tag) {
  const version = parseVersion(tag);
  if (!version) throw new Error(`"${tag}" is not a version tag like v1.2.3.`);
  return version;
}

// Numbers rank by value and below words, which go by character code.
function compareIdentifiers(a, b) {
  const aIsNumber = /^\d+$/.test(a);
  const bIsNumber = /^\d+$/.test(b);
  if (aIsNumber && bIsNumber) return Number(a) - Number(b);
  if (aIsNumber !== bIsNumber) return aIsNumber ? -1 : 1;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Negative when version tag `a` ranks below `b`, positive when above and 0
 * when they are the same version, by semver.org's precedence rules: a release
 * outranks its own prereleases, and `beta.10` outranks `beta.9`.
 */
export function compareVersions(a, b) {
  const x = requireVersion(a);
  const y = requireVersion(b);
  for (let i = 0; i < x.core.length; i++) {
    if (x.core[i] !== y.core[i]) return x.core[i] - y.core[i];
  }
  if (x.prerelease.length === 0 || y.prerelease.length === 0) {
    return y.prerelease.length - x.prerelease.length;
  }
  const shared = Math.min(x.prerelease.length, y.prerelease.length);
  for (let i = 0; i < shared; i++) {
    const order = compareIdentifiers(x.prerelease[i], y.prerelease[i]);
    if (order !== 0) return order;
  }
  return x.prerelease.length - y.prerelease.length;
}

/**
 * The release that `tag` follows: the highest version below it among the
 * releases' `tags`, prereleases included. Null for the first release. Tags
 * that are not versions are ignored.
 */
export function previousReleaseTag(tag, tags) {
  requireVersion(tag);
  const earlier = tags.filter(
    (other) => parseVersion(other) && compareVersions(other, tag) < 0,
  );
  return earlier.sort(compareVersions).at(-1) ?? null;
}

/**
 * The New Contributors section of GitHub's generated `notes`: its heading and
 * list, without the "Full Changelog" line after it and without bot accounts.
 * An empty string when there is no such section or it lists no one else.
 */
export function newContributorsSection(notes) {
  const lines = notes.split(/\r?\n/);
  const start = lines.findIndex((line) => HEADING.test(line));
  if (start === -1) return "";

  // The list ends at the first line that is neither blank nor a list item.
  const items = [];
  for (const line of lines.slice(start + 1)) {
    if (LIST_ITEM.test(line)) items.push(line);
    else if (line.trim() !== "") break;
  }
  const people = items.filter((item) => !BOT_ITEM.test(item));
  return people.length === 0 ? "" : [lines[start].trim(), ...people].join("\n");
}

/**
 * The release `body` followed by `section`. It is returned as it is when there
 * is nothing to add or it already has a New Contributors section.
 */
export function appendSection(body, section) {
  if (section === "" || HEADING.test(body)) return body;
  const notes = body.trimEnd();
  return notes === "" ? `${section}\n` : `${notes}\n\n${section}\n`;
}

/**
 * Add the New Contributors section of `tag`'s generated notes to its release.
 * `gh(args, input)` runs the GitHub CLI and returns what it printed. Returns
 * what happened, for the log.
 */
export function thankNewContributors({ repo, tag, gh, dryRun = false }) {
  if (!REPOSITORY.test(repo)) {
    throw new Error(`"${repo}" is not a repository like owner/name.`);
  }
  requireVersion(tag);

  const release = JSON.parse(
    gh(["release", "view", tag, "--repo", repo, "--json", "body"]),
  );
  const body = release.body ?? "";
  if (HEADING.test(body)) {
    return `${tag}: the release already has a New Contributors section.`;
  }

  const releases = JSON.parse(
    gh([
      "release",
      "list",
      "--repo",
      repo,
      "--limit",
      "1000",
      "--json",
      "tagName,isDraft",
    ]),
  );
  // A draft has no tag yet, so it cannot start a range.
  const published = releases.filter((r) => !r.isDraft).map((r) => r.tagName);
  const previous = previousReleaseTag(tag, published);
  if (previous === null) {
    return `${tag}: there is no earlier release to compare with.`;
  }

  const generated = JSON.parse(
    gh([
      "api",
      "--method",
      "POST",
      `repos/${repo}/releases/generate-notes`,
      "--raw-field",
      `tag_name=${tag}`,
      "--raw-field",
      `previous_tag_name=${previous}`,
    ]),
  );
  const section = newContributorsSection(generated.body ?? "");
  if (section === "") {
    return `${tag}: no new contributors since ${previous}.`;
  }

  if (dryRun) {
    return `${tag}: dry run, would add (since ${previous}):\n${section}`;
  }
  gh(
    ["release", "edit", tag, "--repo", repo, "--notes-file", "-"],
    appendSection(body, section),
  );
  return `${tag}: thanked the new contributors since ${previous}:\n${section}`;
}

function runGh(args, input) {
  return execFileSync("gh", args, {
    encoding: "utf8",
    input,
    // gh's own error messages go straight to the log.
    stdio: ["pipe", "pipe", "inherit"],
  });
}

function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      tag: { type: "string" },
      repo: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const repo = values.repo ?? process.env.GITHUB_REPOSITORY;
  if (!values.tag || !repo) {
    console.error(
      "Usage: thank-new-contributors.mjs --tag <tag> [--repo <owner/name>] [--dry-run]",
    );
    process.exit(1);
  }
  try {
    console.log(
      thankNewContributors({
        repo,
        tag: values.tag,
        gh: runGh,
        dryRun: values["dry-run"],
      }),
    );
  } catch (error) {
    console.error(
      `Could not thank the new contributors of ${values.tag}: ${error.message}`,
    );
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main(process.argv.slice(2));
}
