#!/usr/bin/env node
/**
 * Promote a release to production (inkweld.app).
 *
 *   node scripts/promote-production.mjs --tag v1.0.0-beta.9
 *
 * release-please.yml runs it once the release image is published. It moves
 * the long-lived `production` branch to the release tag's commit and starts
 * deploy-cloudflare-production.yml there. It needs `gh`, a token that can
 * write the repository's contents and run its workflows (GH_TOKEN), and the
 * repository from GITHUB_REPOSITORY or `--repo owner/name`.
 *
 * - `production` is fast-forwarded through the refs API without force, so a
 *   `production` that has left `main` makes the update fail instead of moving.
 * - The tag's commit is promoted, not the tip of `main`, which may have moved
 *   on while the image was building.
 * - A `production` already past the release (promoted by hand) is left alone.
 * - A ref update made with GITHUB_TOKEN doesn't fire the deploy's push
 *   trigger, so the deploy is started with workflow_dispatch. When
 *   `production` is already at the release, the deploy is started only if no
 *   run of the deploy workflow on `production` has that commit, so running
 *   this again after a failed dispatch still deploys, while a release
 *   promoted by hand (whose push started a deploy) is not deployed twice.
 */

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const REPOSITORY = /^[\w.-]+\/[\w.-]+$/;
const TAG = /^v\d+\.\d+\.\d+(?:-[\dA-Za-z.-]+)?$/;
const BRANCH = "production";
const DEPLOY_WORKFLOW = "deploy-cloudflare-production.yml";

/**
 * Move `production` to `tag`'s commit and deploy it, as described above.
 * `gh(args)` runs the GitHub CLI and returns what it printed. Returns what
 * happened, for the log.
 */
export function promoteProduction({ repo, tag, gh }) {
  if (!REPOSITORY.test(repo)) {
    throw new Error(`"${repo}" is not a repository like owner/name.`);
  }
  if (!TAG.test(tag)) {
    throw new Error(`"${tag}" is not a release tag like v1.2.3.`);
  }

  // The commits endpoint peels annotated tags to the commit they point at.
  const sha = gh([
    "api",
    `repos/${repo}/commits/${tag}`,
    "--jq",
    ".sha",
  ]).trim();
  // How production compares with the release: "ahead" means production has
  // commits the release doesn't, "behind" that it is an ancestor of it.
  const status = gh([
    "api",
    `repos/${repo}/compare/${sha}...${BRANCH}`,
    "--jq",
    ".status",
  ]).trim();

  let moved = false;
  if (status === "ahead") {
    return `${tag}: production is already past it; left alone.`;
  }
  if (status === "identical") {
    const runs = JSON.parse(
      gh([
        "run",
        "list",
        "--repo",
        repo,
        "--workflow",
        DEPLOY_WORKFLOW,
        "--branch",
        BRANCH,
        "--commit",
        sha,
        "--json",
        "databaseId",
      ]),
    );
    if (runs.length > 0) {
      return `${tag}: production is already at it and has been deployed.`;
    }
  } else {
    gh([
      "api",
      "--method",
      "PATCH",
      `repos/${repo}/git/refs/heads/${BRANCH}`,
      "-f",
      `sha=${sha}`,
      "-F",
      "force=false",
    ]);
    moved = true;
  }

  gh(["workflow", "run", DEPLOY_WORKFLOW, "--repo", repo, "--ref", BRANCH]);
  return moved
    ? `${tag}: production fast-forwarded to ${sha} and its deploy started.`
    : `${tag}: production was already at ${sha}; its deploy started.`;
}

function runGh(args) {
  return execFileSync("gh", args, {
    encoding: "utf8",
    // gh's own error messages go straight to the log.
    stdio: ["ignore", "pipe", "inherit"],
  });
}

function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      tag: { type: "string" },
      repo: { type: "string" },
    },
  });
  const repo = values.repo ?? process.env.GITHUB_REPOSITORY;
  if (!values.tag || !repo) {
    console.error(
      "Usage: promote-production.mjs --tag <tag> [--repo <owner/name>]",
    );
    process.exit(1);
  }
  try {
    console.log(promoteProduction({ repo, tag: values.tag, gh: runGh }));
  } catch (error) {
    console.error(`Could not promote ${values.tag}: ${error.message}`);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main(process.argv.slice(2));
}
