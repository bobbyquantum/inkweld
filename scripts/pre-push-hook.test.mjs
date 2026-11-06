/**
 * Which commits `.husky/pre-push` sends to commitlint. Each test builds a
 * throwaway repository and runs the real hook with the input git gives it
 * (`<local ref> <local oid> <remote ref> <remote oid>` lines on stdin). A fake
 * `npx` on PATH stands in for commitlint: it records the subject of every
 * message it is given and rejects subjects starting with "bad".
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK = fileURLToPath(new URL("../.husky/pre-push", import.meta.url));
const ZERO = "0000000000000000000000000000000000000000";

let dir;
let repo;
let log;
let bin;

function git(...args) {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function commit(subject) {
  git("commit", "-q", "--allow-empty", "--no-verify", "-m", subject);
  return git("rev-parse", "HEAD");
}

/** Run the hook for one ref update; returns its exit code and the linted subjects. */
function push(localOid, remoteOid) {
  writeFileSync(log, "");
  const result = spawnSync("sh", [HOOK, "origin", "url"], {
    cwd: repo,
    encoding: "utf8",
    input: `refs/heads/feature ${localOid} refs/heads/feature ${remoteOid}\n`,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, LINT_LOG: log },
  });
  const linted = readFileSync(log, "utf8").split("\n").filter(Boolean);
  return { status: result.status, linted };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pre-push-"));
  repo = join(dir, "repo");
  bin = join(dir, "bin");
  log = join(dir, "lint.log");
  mkdirSync(repo);
  mkdirSync(bin);
  writeFileSync(
    join(bin, "npx"),
    [
      "#!/bin/sh",
      "subject=$(head -n 1)",
      'printf "%s\\n" "$subject" >> "$LINT_LOG"',
      'case "$subject" in bad*) exit 1 ;; esac',
      "exit 0",
      "",
    ].join("\n"),
  );
  chmodSync(join(bin, "npx"), 0o755);

  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  git("config", "commit.gpgsign", "false");
  git("config", "core.hooksPath", "/dev/null");
  commit("chore: start");
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  git("checkout", "-q", "-b", "feature");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("pre-push commit selection", () => {
  it("skips commits from main that a merge brought in, and the merge itself", () => {
    const pushed = commit("feat: branch work");
    git("update-ref", "refs/remotes/origin/feature", pushed);
    // main gets a commit commitlint would refuse, and the branch merges it.
    git("checkout", "-q", "main");
    const onMain = commit("bad header that landed on main");
    git("update-ref", "refs/remotes/origin/main", onMain);
    git("checkout", "-q", "feature");
    git("merge", "-q", "--no-ff", "--no-edit", "main");
    const next = commit("fix: more branch work");

    const result = push(next, pushed);
    expect(result.status).toBe(0);
    expect(result.linted).toEqual(["fix: more branch work"]);
  });

  it("refuses a bad commit made on the branch", () => {
    const pushed = commit("feat: branch work");
    git("update-ref", "refs/remotes/origin/feature", pushed);
    const bad = commit("bad message");

    const result = push(bad, pushed);
    expect(result.status).toBe(1);
    expect(result.linted).toEqual(["bad message"]);
  });

  it("checks a new branch's commits that are on no remote", () => {
    commit("feat: one");
    const tip = commit("feat: two");

    const result = push(tip, ZERO);
    expect(result.status).toBe(0);
    expect(result.linted.sort()).toEqual(["feat: one", "feat: two"]);
  });

  it("checks the commits on no remote when the remote tip isn't available locally", () => {
    commit("feat: one");
    const bad = commit("bad message");

    const result = push(bad, "1234567890123456789012345678901234567890");
    expect(result.status).toBe(1);
    expect(result.linted).toContain("bad message");
  });

  it("checks the whole range when origin/main was never fetched", () => {
    const pushed = commit("feat: branch work");
    git("checkout", "-q", "main");
    commit("bad header that landed on main");
    git("checkout", "-q", "feature");
    git("merge", "-q", "--no-ff", "--no-edit", "main");
    const next = commit("fix: more branch work");
    git("update-ref", "-d", "refs/remotes/origin/main");

    const result = push(next, pushed);
    expect(result.status).toBe(1);
    expect(result.linted).toContain("bad header that landed on main");
  });

  it("checks nothing for a branch deletion", () => {
    const result = push(ZERO, git("rev-parse", "HEAD"));
    expect(result.status).toBe(0);
    expect(result.linted).toEqual([]);
  });
});
