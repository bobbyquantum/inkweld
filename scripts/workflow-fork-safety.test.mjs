/**
 * GitHub withholds secrets from `pull_request` runs on forks, so a job in such
 * a workflow that reads one fails there (the first fork PR hit it in
 * SonarCloud). Every job that reads a secret must skip forks. The rule and the
 * reasons for it are under "Pull requests from forks" in
 * docs/site/docs/admin-guide/ci-cd.md.
 */
import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const WORKFLOWS_DIR = fileURLToPath(
  new URL("../.github/workflows", import.meta.url),
);

const FORK_GUARD =
  "github.event.pull_request.head.repo.full_name == github.repository";
const FORK_GUARD_PATTERN =
  /github\.event\.pull_request\.head\.repo\.full_name\s*==\s*github\.repository/;

// `secrets.NAME` or `secrets['NAME']`.
const SECRET_REFERENCE = /\bsecrets(?:\.([\w-]+)|\[\s*['"]([^'"]+)['"]\s*\])/g;

/** Whether the workflow runs on `pull_request` (not `pull_request_target`). */
function runsOnPullRequest(workflow) {
  // A YAML 1.1 parser reads the key `on` as the boolean true.
  const triggers = workflow.on ?? workflow[true];
  if (typeof triggers === "string") return triggers === "pull_request";
  if (Array.isArray(triggers)) return triggers.includes("pull_request");
  return Object.hasOwn(triggers ?? {}, "pull_request");
}

/** Whether the job reads a secret other than the always-present GITHUB_TOKEN. */
function readsSecret(job) {
  if (job.secrets === "inherit") return true;
  return [...JSON.stringify(job).matchAll(SECRET_REFERENCE)].some(
    (match) => (match[1] ?? match[2]).toUpperCase() !== "GITHUB_TOKEN",
  );
}

/** Each job of a `pull_request` workflow that reads a secret, as `file#job`. */
function secretJobs(file, workflow) {
  if (!runsOnPullRequest(workflow)) return [];
  return Object.entries(workflow.jobs ?? {})
    .filter(([, job]) => readsSecret(job))
    .map(([id, job]) => ({
      name: `${file}#${id}`,
      skipsForks: FORK_GUARD_PATTERN.test(job.if ?? ""),
    }));
}

/** The jobs in `secretJobs` that do not skip forks. */
function unguardedJobs(file, workflow) {
  return secretJobs(file, workflow)
    .filter((job) => !job.skipsForks)
    .map((job) => job.name);
}

describe("the repository's workflows", () => {
  const jobs = readdirSync(WORKFLOWS_DIR)
    .filter((file) => /\.ya?ml$/.test(file))
    .flatMap((file) =>
      secretJobs(
        file,
        Bun.YAML.parse(readFileSync(join(WORKFLOWS_DIR, file), "utf8")),
      ),
    );

  it("skip forks in every pull_request job that reads a secret", () => {
    expect(jobs.filter((job) => !job.skipsForks).map((j) => j.name)).toEqual(
      [],
    );
  });

  it("still contain the jobs that need the guard, so this cannot pass vacuously", () => {
    expect(jobs.map((job) => job.name)).toEqual(
      expect.arrayContaining([
        "ci.yml#sonarcloud",
        "cleanup-pr-preview.yml#cleanup",
        "deploy-pr-preview.yml#deploy",
      ]),
    );
  });
});

describe("the fork check", () => {
  const readsToken = { steps: [{ env: { TOKEN: "${{ secrets.TOKEN }}" } }] };
  const check = (on, job) =>
    unguardedJobs("w.yml", { on, jobs: { build: job } });

  it("flags a pull_request job that reads a secret without the guard", () => {
    expect(check("pull_request", readsToken)).toEqual(["w.yml#build"]);
  });

  it("accepts the guard alone or inside a longer condition", () => {
    const inLonger = `\${{ !cancelled() && (github.event_name != 'pull_request' || ${FORK_GUARD}) }}`;
    expect(check("pull_request", { ...readsToken, if: FORK_GUARD })).toEqual(
      [],
    );
    expect(check("pull_request", { ...readsToken, if: inLonger })).toEqual([]);
  });

  it("finds pull_request among several triggers", () => {
    expect(check(["push", "pull_request"], readsToken)).toEqual([
      "w.yml#build",
    ]);
    expect(
      check({ push: {}, pull_request: { types: ["opened"] } }, readsToken),
    ).toEqual(["w.yml#build"]);
  });

  it("flags secrets: inherit and the bracket syntax", () => {
    expect(
      check("pull_request", { uses: "./w.yml", secrets: "inherit" }),
    ).toEqual(["w.yml#build"]);
    expect(
      check("pull_request", { run: "echo ${{ secrets['TOKEN'] }}" }),
    ).toEqual(["w.yml#build"]);
  });

  it("ignores GITHUB_TOKEN, which forks do get", () => {
    const job = { env: { GH_TOKEN: "${{ secrets.GITHUB_TOKEN }}" } };
    expect(check("pull_request", job)).toEqual([]);
  });

  it("ignores workflows that a fork pull request does not trigger", () => {
    expect(check("push", readsToken)).toEqual([]);
    expect(check("pull_request_target", readsToken)).toEqual([]);
  });
});
