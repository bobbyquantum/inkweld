import { afterEach, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

import { promoteProduction } from "./promote-production.mjs";

const repo = "octo/repo";
const tag = "v1.0.0-beta.9";
const sha = "cc60f99ad8e014b195147fa5705f3a6d9bbcc542";

const patchArgs = [
  "api",
  "--method",
  "PATCH",
  "repos/octo/repo/git/refs/heads/production",
  "-f",
  `sha=${sha}`,
  "-F",
  "force=false",
];
const dispatchArgs = [
  "workflow",
  "run",
  "deploy-cloudflare-production.yml",
  "--repo",
  repo,
  "--ref",
  "production",
];

/**
 * A fake `gh` for one release. `status` is how production compares with the
 * release commit, `deploys` the production deploy runs of that commit.
 * `failOn` names a call ("patch" or "dispatch") that fails. It records every
 * call it gets.
 */
function fakeGh({ status = "behind", deploys = [], failOn } = {}) {
  const calls = [];
  const gh = (args) => {
    calls.push(args);
    const joined = args.join(" ");
    if (joined === `api repos/${repo}/commits/${tag} --jq .sha`) {
      return `${sha}\n`;
    }
    if (
      joined === `api repos/${repo}/compare/${sha}...production --jq .status`
    ) {
      return `${status}\n`;
    }
    if (args[0] === "run" && args[1] === "list") return JSON.stringify(deploys);
    if (args[2] === "PATCH") {
      if (failOn === "patch") {
        throw new Error(
          "Command failed: gh api (422 Update is not a fast forward)",
        );
      }
      return "{}";
    }
    if (args[0] === "workflow") {
      if (failOn === "dispatch")
        throw new Error("Command failed: gh workflow run");
      return "";
    }
    throw new Error(`Unexpected: gh ${joined}`);
  };
  return {
    gh,
    calls,
    patches: () => calls.filter((args) => args[2] === "PATCH"),
    dispatches: () => calls.filter((args) => args[0] === "workflow"),
  };
}

describe("promoteProduction", () => {
  it("fast-forwards a production behind the release, then deploys it", () => {
    const { gh, calls, patches, dispatches } = fakeGh({ status: "behind" });

    const message = promoteProduction({ repo, tag, gh });

    expect(patches()).toEqual([patchArgs]);
    expect(dispatches()).toEqual([dispatchArgs]);
    // The ref moves before the deploy starts.
    expect(calls.indexOf(patches()[0])).toBeLessThan(
      calls.indexOf(dispatches()[0]),
    );
    expect(message).toContain("fast-forwarded");
  });

  it("leaves a production that is already past the release alone", () => {
    const { gh, patches, dispatches } = fakeGh({ status: "ahead" });

    const message = promoteProduction({ repo, tag, gh });

    expect(patches()).toEqual([]);
    expect(dispatches()).toEqual([]);
    expect(message).toContain("already past");
  });

  it("stops before deploying when the update is rejected", () => {
    const { gh, patches, dispatches } = fakeGh({
      status: "diverged",
      failOn: "patch",
    });

    expect(() => promoteProduction({ repo, tag, gh })).toThrow(
      "not a fast forward",
    );
    expect(patches()).toEqual([patchArgs]);
    expect(dispatches()).toEqual([]);
  });

  it("deploys a production already at the release with no deploy for it", () => {
    const { gh, calls, patches, dispatches } = fakeGh({
      status: "identical",
      deploys: [],
    });

    const message = promoteProduction({ repo, tag, gh });

    expect(patches()).toEqual([]);
    expect(dispatches()).toEqual([dispatchArgs]);
    // Only production runs of the deploy workflow on this commit count.
    expect(calls.find((args) => args[0] === "run")).toEqual([
      "run",
      "list",
      "--repo",
      repo,
      "--workflow",
      "deploy-cloudflare-production.yml",
      "--branch",
      "production",
      "--commit",
      sha,
      "--json",
      "databaseId",
    ]);
    expect(message).toContain("already at");
  });

  it("doesn't deploy again when production already has a deploy of the release", () => {
    const { gh, patches, dispatches } = fakeGh({
      status: "identical",
      deploys: [{ databaseId: 1 }],
    });

    const message = promoteProduction({ repo, tag, gh });

    expect(patches()).toEqual([]);
    expect(dispatches()).toEqual([]);
    expect(message).toContain("has been deployed");
  });

  it("deploys on a retry after the first dispatch failed, without moving the ref again", () => {
    const first = fakeGh({ status: "behind", failOn: "dispatch" });
    expect(() => promoteProduction({ repo, tag, gh: first.gh })).toThrow(
      "workflow run",
    );
    expect(first.patches()).toEqual([patchArgs]);

    // The ref moved, so the retry finds production at the release, with no
    // deploy because the dispatch never happened.
    const retry = fakeGh({ status: "identical", deploys: [] });
    promoteProduction({ repo, tag, gh: retry.gh });

    expect(retry.patches()).toEqual([]);
    expect(retry.dispatches()).toEqual([dispatchArgs]);
  });

  it("resolves the tag through the commits API, which peels annotated tags", () => {
    const { gh, calls } = fakeGh();

    promoteProduction({ repo, tag, gh });

    expect(calls[0]).toEqual([
      "api",
      `repos/${repo}/commits/${tag}`,
      "--jq",
      ".sha",
    ]);
  });

  it("refuses a repository or tag it doesn't recognise", () => {
    const { gh, calls } = fakeGh();

    expect(() => promoteProduction({ repo: "octo", tag, gh })).toThrow(
      "owner/name",
    );
    expect(() => promoteProduction({ repo, tag: "main", gh })).toThrow(
      "release tag",
    );
    expect(calls).toEqual([]);
  });
});

// A `gh` that answers from, and records its calls in, the state file named by
// FAKE_GH_STATE. It runs with the same Bun as the tests.
const fakeGhScript = `#!${process.execPath}
const fs = require("node:fs");
const path = process.env.FAKE_GH_STATE;
const state = JSON.parse(fs.readFileSync(path, "utf8"));
const args = process.argv.slice(2);
state.calls.push(args);
let output = "";
if (args[0] === "api" && args[1].includes("/commits/")) {
  output = state.sha + "\\n";
} else if (args[0] === "api" && args[1].includes("/compare/")) {
  output = state.status + "\\n";
} else if (args[0] === "run") {
  output = JSON.stringify(state.deploys);
} else if (args[2] === "PATCH") {
  state.status = "identical";
  output = "{}";
} else if (args[0] === "workflow") {
  output = "";
} else {
  console.error("unexpected: gh " + args.join(" "));
  process.exit(2);
}
fs.writeFileSync(path, JSON.stringify(state));
process.stdout.write(output);
`;

const script = fileURLToPath(
  new URL("./promote-production.mjs", import.meta.url),
);

// Runs the real script, which runs the fake gh above.
describe.skipIf(process.platform === "win32")("promote-production.mjs", () => {
  let dir;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function setUp(state = {}) {
    dir = mkdtempSync(join(tmpdir(), "promote-production-"));
    const statePath = join(dir, "state.json");
    writeFileSync(
      statePath,
      JSON.stringify({
        sha,
        status: "behind",
        deploys: [],
        calls: [],
        ...state,
      }),
    );
    writeFileSync(join(dir, "gh"), fakeGhScript, { mode: 0o755 });
    const env = {
      ...process.env,
      PATH: `${dir}${delimiter}${process.env.PATH}`,
      GITHUB_REPOSITORY: repo,
      FAKE_GH_STATE: statePath,
    };
    return {
      run: (...args) =>
        spawnSync(process.execPath, [script, ...args], {
          env,
          encoding: "utf8",
        }),
      read: () => JSON.parse(readFileSync(statePath, "utf8")),
    };
  }

  it("promotes the release and starts its deploy", () => {
    const { run, read } = setUp();

    const result = run("--tag", tag);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("fast-forwarded");
    const calls = read().calls;
    expect(calls.filter((args) => args[2] === "PATCH")).toEqual([patchArgs]);
    expect(calls.filter((args) => args[0] === "workflow")).toEqual([
      dispatchArgs,
    ]);
  });

  it("exits with an error and a usage line without --tag", () => {
    const { run, read } = setUp();

    const result = run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Usage:");
    expect(read().calls).toEqual([]);
  });
});
