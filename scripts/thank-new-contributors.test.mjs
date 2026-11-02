import { afterEach, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  appendSection,
  compareVersions,
  newContributorsSection,
  previousReleaseTag,
  thankNewContributors,
} from "./thank-new-contributors.mjs";

const repo = "octo/repo";
const tag = "v1.0.0-beta.4";

// What release-please publishes: no newline after the last entry.
const releaseNotes = [
  "## [1.0.0-beta.4](https://github.com/octo/repo/compare/v1.0.0-beta.3...v1.0.0-beta.4) (2026-11-03)",
  "",
  "",
  "### Features",
  "",
  "* 🔐 **auth:** add OIDC sign-in ([#42](https://github.com/octo/repo/issues/42)) ([abc1234](https://github.com/octo/repo/commit/abc1234))",
].join("\n");

// What the generate-notes API returns when someone contributes for the first
// time. The bot is not new, only the person is.
const generatedNotes = [
  "## What's Changed",
  "* feat(auth): add OIDC sign-in by @octocat in https://github.com/octo/repo/pull/42",
  "* chore(deps): lock file maintenance by @renovate[bot] in https://github.com/octo/repo/pull/41",
  "",
  "## New Contributors",
  "* @octocat made their first contribution in https://github.com/octo/repo/pull/42",
  "",
  "",
  "**Full Changelog**: https://github.com/octo/repo/compare/v1.0.0-beta.3...v1.0.0-beta.4",
].join("\n");

const section = [
  "## New Contributors",
  "* @octocat made their first contribution in https://github.com/octo/repo/pull/42",
].join("\n");

const withoutNewContributors = [
  "## What's Changed",
  "* feat(auth): add OIDC sign-in by @bobbyquantum in https://github.com/octo/repo/pull/42",
  "",
  "",
  "**Full Changelog**: https://github.com/octo/repo/compare/v1.0.0-beta.3...v1.0.0-beta.4",
].join("\n");

// A release of actions/checkout as GitHub stores it after an edit in the web
// UI, with CRLF line endings.
const checkoutRelease = [
  "## What's Changed",
  "* Update README.md for V4 by @sivapalan in https://github.com/actions/checkout/pull/1452",
  "* Add support for partial checkout filters by @finleygn in https://github.com/actions/checkout/pull/1396",
  "* Prepare 4.1.0 release by @cory-miller in https://github.com/actions/checkout/pull/1496",
  "",
  "## New Contributors",
  "* @sivapalan made their first contribution in https://github.com/actions/checkout/pull/1452",
  "* @finleygn made their first contribution in https://github.com/actions/checkout/pull/1396",
  "",
  "**Full Changelog**: https://github.com/actions/checkout/compare/v4.0.0...v4.1.0",
].join("\r\n");

const published = ["v1.0.0-beta.4", "v1.0.0-beta.3", "v1.0.0-beta.2"].map(
  (tagName) => ({ tagName, isDraft: false }),
);

describe("compareVersions", () => {
  it("follows the precedence example of semver.org", () => {
    const ordered = [
      "1.0.0-alpha",
      "1.0.0-alpha.1",
      "1.0.0-alpha.beta",
      "1.0.0-beta",
      "1.0.0-beta.2",
      "1.0.0-beta.11",
      "1.0.0-rc.1",
      "1.0.0",
    ];
    expect([...ordered].reverse().sort(compareVersions)).toEqual(ordered);
  });

  it("compares the numbers of a version by value", () => {
    expect(compareVersions("v1.9.0", "v1.10.0")).toBeLessThan(0);
    expect(compareVersions("v2.0.0", "v1.99.99")).toBeGreaterThan(0);
    expect(compareVersions("v1.0.0-beta.9", "v1.0.0-beta.10")).toBeLessThan(0);
  });

  it("ignores the leading v and build metadata", () => {
    expect(compareVersions("v1.2.3", "1.2.3+build.5")).toBe(0);
  });
});

describe("previousReleaseTag", () => {
  it("is the release just before, prereleases included", () => {
    const tags = ["v1.0.0-beta.1", "v1.0.0-beta.2", "v1.0.0-beta.3"];
    expect(previousReleaseTag("v1.0.0-beta.4", tags)).toBe("v1.0.0-beta.3");
    expect(previousReleaseTag("v1.0.0-beta.3", tags)).toBe("v1.0.0-beta.2");
  });

  it("does not depend on the order of the list or on the number of digits", () => {
    const tags = ["v1.0.0-beta.2", "v1.0.0-beta.9", "v1.0.0-beta.1"];
    expect(previousReleaseTag("v1.0.0-beta.10", tags)).toBe("v1.0.0-beta.9");
  });

  it("follows the last beta with the stable release", () => {
    const tags = ["v0.9.0", "v1.0.0-beta.1", "v1.0.0-beta.12", "v1.0.0-beta.2"];
    expect(previousReleaseTag("v1.0.0", tags)).toBe("v1.0.0-beta.12");
  });

  it("follows the last stable release with the first beta of the next series", () => {
    const tags = ["v1.0.0-beta.3", "v1.0.0", "v1.0.1", "v0.9.0"];
    expect(previousReleaseTag("v1.1.0-beta.1", tags)).toBe("v1.0.1");
  });

  it("skips the release itself, later releases and tags that are no versions", () => {
    const tags = ["v1.0.0-beta.5", "v1.0.0-beta.4", "nightly", "v1.0.0-beta.2"];
    expect(previousReleaseTag("v1.0.0-beta.4", tags)).toBe("v1.0.0-beta.2");
  });

  it("is null for the first release", () => {
    expect(previousReleaseTag("v1.0.0-beta.1", ["v1.0.0-beta.1"])).toBeNull();
    expect(previousReleaseTag("v1.0.0-beta.1", [])).toBeNull();
  });

  it("leaves the list it is given as it was", () => {
    const tags = ["v1.0.0-beta.3", "v1.0.0-beta.1", "v1.0.0-beta.2"];
    previousReleaseTag("v1.0.0-beta.4", tags);
    expect(tags).toEqual(["v1.0.0-beta.3", "v1.0.0-beta.1", "v1.0.0-beta.2"]);
  });

  it("refuses a tag that is not a version", () => {
    expect(() => previousReleaseTag("nightly", ["v1.0.0"])).toThrow(
      '"nightly" is not a version tag',
    );
  });
});

describe("newContributorsSection", () => {
  it("returns the heading and the list, not the Full Changelog line", () => {
    expect(newContributorsSection(generatedNotes)).toBe(section);
  });

  it("reads notes with CRLF line endings", () => {
    expect(newContributorsSection(checkoutRelease)).toBe(
      [
        "## New Contributors",
        "* @sivapalan made their first contribution in https://github.com/actions/checkout/pull/1452",
        "* @finleygn made their first contribution in https://github.com/actions/checkout/pull/1396",
      ].join("\n"),
    );
  });

  it("returns nothing when no one contributes for the first time", () => {
    expect(newContributorsSection(withoutNewContributors)).toBe("");
    expect(newContributorsSection("")).toBe("");
  });

  it("stops at the next heading", () => {
    const notes = [
      "## New Contributors",
      "* @octocat made their first contribution in https://github.com/octo/repo/pull/42",
      "## Something else",
      "* not a contributor",
    ].join("\n");
    expect(newContributorsSection(notes)).toBe(
      [
        "## New Contributors",
        "* @octocat made their first contribution in https://github.com/octo/repo/pull/42",
      ].join("\n"),
    );
  });

  it("does not thank bots", () => {
    const notes = [
      "## New Contributors",
      "* @dependabot[bot] made their first contribution in https://github.com/octo/repo/pull/1",
      "* @octocat made their first contribution in https://github.com/octo/repo/pull/42",
      "* @Renovate[bot] made their first contribution in https://github.com/octo/repo/pull/2",
    ].join("\n");
    expect(newContributorsSection(notes)).toBe(section);
  });

  it("returns nothing when only bots are new", () => {
    const notes = [
      "## What's Changed",
      "* chore: bump by @dependabot[bot] in https://github.com/octo/repo/pull/1",
      "",
      "## New Contributors",
      "* @dependabot[bot] made their first contribution in https://github.com/octo/repo/pull/1",
      "",
      "**Full Changelog**: https://github.com/octo/repo/compare/v1...v2",
    ].join("\n");
    expect(newContributorsSection(notes)).toBe("");
  });
});

describe("appendSection", () => {
  it("adds the section after the release notes, which stay as they are", () => {
    const result = appendSection(releaseNotes, section);
    expect(result).toBe(`${releaseNotes}\n\n${section}\n`);
    expect(result.startsWith(releaseNotes)).toBe(true);
  });

  it("changes nothing when run again", () => {
    const once = appendSection(releaseNotes, section);
    expect(appendSection(once, section)).toBe(once);
  });

  it("leaves notes alone that already have such a section", () => {
    const body = `${releaseNotes}\n\n### New Contributors\n\n* @someone`;
    expect(appendSection(body, section)).toBe(body);
    expect(appendSection(checkoutRelease, section)).toBe(checkoutRelease);
  });

  it("changes nothing without a section", () => {
    expect(appendSection(releaseNotes, "")).toBe(releaseNotes);
  });

  it("does not stack blank lines after notes that end in a newline", () => {
    expect(appendSection(`${releaseNotes}\n\n`, section)).toBe(
      `${releaseNotes}\n\n${section}\n`,
    );
  });

  it("starts the notes with the section when there are none", () => {
    expect(appendSection("", section)).toBe(`${section}\n`);
  });
});

/** A fake `gh` serving one release. It records every call it gets. */
function fakeGh({
  releases = published,
  generated = generatedNotes,
  failOn,
} = {}) {
  const state = { body: releaseNotes, calls: [] };
  const gh = (args, input) => {
    state.calls.push({ args, input });
    const command = args[0] === "api" ? "api" : `${args[0]} ${args[1]}`;
    if (command === failOn) throw new Error(`Command failed: gh ${command}`);
    switch (command) {
      case "release view":
        return JSON.stringify({ body: state.body });
      case "release list":
        return JSON.stringify(releases);
      case "api":
        return JSON.stringify({ name: tag, body: generated });
      case "release edit":
        state.body = input;
        return "";
      default:
        throw new Error(`Unexpected: gh ${args.join(" ")}`);
    }
  };
  return {
    gh,
    state,
    generateCalls: () => state.calls.filter((call) => call.args[0] === "api"),
    editCalls: () => state.calls.filter((call) => call.args[1] === "edit"),
  };
}

describe("thankNewContributors", () => {
  it("adds the section to the release, comparing with the previous release", () => {
    const { gh, state, generateCalls, editCalls } = fakeGh();

    const message = thankNewContributors({ repo, tag, gh });

    expect(generateCalls().map((call) => call.args)).toEqual([
      [
        "api",
        "--method",
        "POST",
        "repos/octo/repo/releases/generate-notes",
        "--raw-field",
        "tag_name=v1.0.0-beta.4",
        "--raw-field",
        "previous_tag_name=v1.0.0-beta.3",
      ],
    ]);
    expect(editCalls().map((call) => call.args)).toEqual([
      ["release", "edit", tag, "--repo", repo, "--notes-file", "-"],
    ]);
    expect(state.body).toBe(`${releaseNotes}\n\n${section}\n`);
    expect(message).toContain("@octocat");
  });

  it("names the real previous release, whatever else is in the list", () => {
    const releases = [
      { tagName: "v1.0.0-beta.5", isDraft: false },
      { tagName: tag, isDraft: false },
      { tagName: "v1.0.0-beta.3", isDraft: true },
      { tagName: "nightly", isDraft: false },
      { tagName: "v1.0.0-beta.2", isDraft: false },
      { tagName: "v1.0.0-beta.1", isDraft: false },
    ];
    const { gh, generateCalls } = fakeGh({ releases });

    thankNewContributors({ repo, tag, gh });

    expect(generateCalls()[0].args).toContain(
      "previous_tag_name=v1.0.0-beta.2",
    );
  });

  it("adds nothing the second time", () => {
    const { gh, state, generateCalls, editCalls } = fakeGh();

    thankNewContributors({ repo, tag, gh });
    const message = thankNewContributors({ repo, tag, gh });

    expect(message).toContain("already has a New Contributors section");
    expect(generateCalls()).toHaveLength(1);
    expect(editCalls()).toHaveLength(1);
    expect(state.body.match(/^## New Contributors$/gm)).toHaveLength(1);
  });

  it("changes nothing when no one contributes for the first time", () => {
    const { gh, state, editCalls } = fakeGh({
      generated: withoutNewContributors,
    });

    const message = thankNewContributors({ repo, tag, gh });

    expect(message).toBe(`${tag}: no new contributors since v1.0.0-beta.3.`);
    expect(editCalls()).toHaveLength(0);
    expect(state.body).toBe(releaseNotes);
  });

  it("changes nothing when only bots are new", () => {
    const { gh, editCalls } = fakeGh({
      generated: [
        "## New Contributors",
        "* @dependabot[bot] made their first contribution in https://github.com/octo/repo/pull/1",
      ].join("\n"),
    });

    thankNewContributors({ repo, tag, gh });

    expect(editCalls()).toHaveLength(0);
  });

  it("does not ask GitHub for notes of the first release", () => {
    const { gh, generateCalls, editCalls } = fakeGh({
      releases: [{ tagName: tag, isDraft: false }],
    });

    const message = thankNewContributors({ repo, tag, gh });

    expect(message).toContain("no earlier release");
    expect(generateCalls()).toHaveLength(0);
    expect(editCalls()).toHaveLength(0);
  });

  it("shows the section but does not edit the release on a dry run", () => {
    const { gh, state, editCalls } = fakeGh();

    const message = thankNewContributors({ repo, tag, gh, dryRun: true });

    expect(message).toContain(section);
    expect(editCalls()).toHaveLength(0);
    expect(state.body).toBe(releaseNotes);
  });

  it("checks the repository and the tag before asking GitHub anything", () => {
    const { gh, state } = fakeGh();

    expect(() => thankNewContributors({ repo: "octo", tag, gh })).toThrow(
      "not a repository",
    );
    expect(() => thankNewContributors({ repo, tag: "nightly", gh })).toThrow(
      "not a version tag",
    );
    expect(state.calls).toHaveLength(0);
  });

  it("fails without touching the release when GitHub does", () => {
    for (const failOn of ["release view", "release list", "api"]) {
      const { gh, state, editCalls } = fakeGh({ failOn });
      expect(() => thankNewContributors({ repo, tag, gh })).toThrow(failOn);
      expect(editCalls()).toHaveLength(0);
      expect(state.body).toBe(releaseNotes);
    }
    const { gh } = fakeGh({ failOn: "release edit" });
    expect(() => thankNewContributors({ repo, tag, gh })).toThrow(
      "release edit",
    );
  });
});

// A `gh` that answers from, and records its calls in, the state file named by
// FAKE_GH_STATE. It runs with the same Bun as the tests.
const fakeGhScript = `#!${process.execPath}
const fs = require("node:fs");
const path = process.env.FAKE_GH_STATE;
const state = JSON.parse(fs.readFileSync(path, "utf8"));
const args = process.argv.slice(2);
const stdin = args.includes("-") ? fs.readFileSync(0, "utf8") : "";
state.calls.push({ args, stdin });
const command = args[0] === "api" ? "api" : args[0] + " " + args[1];
let output = "";
if (command === state.failOn) {
  fs.writeFileSync(path, JSON.stringify(state));
  console.error("gh: simulated failure of " + command);
  process.exit(1);
} else if (command === "release view") {
  output = JSON.stringify({ body: state.body });
} else if (command === "release list") {
  output = JSON.stringify(state.releases);
} else if (command === "api") {
  output = JSON.stringify({ body: state.generated });
} else if (command === "release edit") {
  state.body = stdin;
} else {
  console.error("unexpected: gh " + args.join(" "));
  process.exit(2);
}
fs.writeFileSync(path, JSON.stringify(state));
process.stdout.write(output);
`;

const script = fileURLToPath(
  new URL("./thank-new-contributors.mjs", import.meta.url),
);

// Runs the real script, which runs the fake gh above.
describe.skipIf(process.platform === "win32")(
  "thank-new-contributors.mjs",
  () => {
    let dir;

    afterEach(() => {
      if (dir) rmSync(dir, { recursive: true, force: true });
    });

    function setUp(state = {}) {
      dir = mkdtempSync(join(tmpdir(), "thank-new-contributors-"));
      const statePath = join(dir, "state.json");
      writeFileSync(
        statePath,
        JSON.stringify({
          body: releaseNotes,
          releases: published,
          generated: generatedNotes,
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
    const edits = (state) =>
      state.calls.filter((call) => call.args[1] === "edit");

    it("adds the section to the release, once however often it runs", () => {
      const { run, read } = setUp();

      const first = run("--tag", tag);
      expect(first.status).toBe(0);
      expect(first.stdout).toContain("@octocat");
      expect(read().body).toBe(`${releaseNotes}\n\n${section}\n`);
      expect(edits(read())).toHaveLength(1);
      expect(edits(read())[0].args).toEqual([
        "release",
        "edit",
        tag,
        "--repo",
        repo,
        "--notes-file",
        "-",
      ]);

      const second = run("--tag", tag);
      expect(second.status).toBe(0);
      expect(second.stdout).toContain("already has a New Contributors section");
      expect(edits(read())).toHaveLength(1);
    });

    it("leaves the release as it is on a dry run", () => {
      const { run, read } = setUp();

      const result = run("--tag", tag, "--dry-run");

      expect(result.status).toBe(0);
      expect(result.stdout).toContain(section);
      expect(edits(read())).toHaveLength(0);
    });

    it("fails, and leaves the release as it is, when GitHub fails", () => {
      const { run, read } = setUp({ failOn: "api" });

      const result = run("--tag", tag);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        `Could not thank the new contributors of ${tag}`,
      );
      expect(edits(read())).toHaveLength(0);
      expect(read().body).toBe(releaseNotes);
    });

    it("needs a tag and a repository", () => {
      const { run, read } = setUp();

      const result = run();

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Usage:");
      expect(read().calls).toHaveLength(0);
    });
  },
);
