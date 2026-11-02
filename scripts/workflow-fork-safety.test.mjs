/**
 * GitHub withholds secrets from `pull_request` runs on forks, so a job in such
 * a workflow that reads one fails there (the first fork PR hit it in
 * SonarCloud). Every job that reads a secret must skip forks. The rule and the
 * reasons for it are under "Pull requests from forks" in
 * docs/site/docs/admin-guide/ci-cd.md.
 *
 * These checks read the workflow text; they do not evaluate the conditions.
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

// A top-level `&&` operand of a job's `if:` that is false for every fork pull
// request: the guard, alone or behind `github.event_name != 'pull_request' ||`
// (for a job that also runs on push), optionally in parentheses.
const FORK_SAFE_OPERAND =
  /^\(?(?:github\.event_name != 'pull_request' \|\| )?github\.event\.pull_request\.head\.repo\.full_name == github\.repository\)?$/;

// Quoted strings, parentheses and `&&`: what decides where the top-level
// operands of a condition begin and end.
const CONDITION_TOKEN = /'(?:[^']|'')*'|[()]|&&/g;

// The `secrets` context, and the member read from it when that is a literal.
const SECRETS_CONTEXT =
  /(?<![\w.])secrets\b(?:\.([\w-]+)|\[\s*'([^']*)'\s*\])?/g;

/** Whether the workflow runs on `pull_request` (not `pull_request_target`). */
function runsOnPullRequest(workflow) {
  // A YAML 1.1 parser reads the key `on` as the boolean true.
  const triggers = workflow.on ?? workflow[true];
  if (typeof triggers === "string") return triggers === "pull_request";
  if (Array.isArray(triggers)) return triggers.includes("pull_request");
  return Object.hasOwn(triggers ?? {}, "pull_request");
}

/** The expressions in a parsed value: inside each `${{ }}`, and a whole `if:`. */
function expressionsIn(value, key) {
  if (typeof value === "string") {
    const embedded = [...value.matchAll(/\$\{\{([\s\S]*?)\}\}/g)].map(
      (match) => match[1],
    );
    return key === "if" ? [...embedded, value] : embedded;
  }
  if (Array.isArray(value)) return value.flatMap((item) => expressionsIn(item));
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([name, member]) =>
      expressionsIn(member, name),
    );
  }
  return [];
}

/**
 * Whether the job reads a secret other than the always-present GITHUB_TOKEN.
 * A computed name (`secrets[matrix.name]`) or the whole context counts.
 */
function readsSecret(job) {
  if (job.secrets === "inherit") return true;
  return expressionsIn(job).some((expression) =>
    [...expression.matchAll(SECRETS_CONTEXT)].some(
      ([, dotted, quoted]) =>
        (dotted ?? quoted)?.toUpperCase() !== "GITHUB_TOKEN",
    ),
  );
}

/** Split a condition at its top-level `&&` (outside parentheses and quotes). */
function andOperands(condition) {
  const operands = [];
  let depth = 0;
  let start = 0;
  for (const match of condition.matchAll(CONDITION_TOKEN)) {
    const [token] = match;
    if (token === "(") depth++;
    else if (token === ")") depth--;
    else if (token === "&&" && depth === 0) {
      operands.push(condition.slice(start, match.index).trim());
      start = match.index + token.length;
    }
  }
  operands.push(condition.slice(start).trim());
  return operands;
}

/** Whether a job's `if:` has an operand that is false for every fork PR. */
function skipsForks(condition) {
  const text = String(condition ?? "").trim();
  const expression =
    text.startsWith("${{") && text.endsWith("}}") ? text.slice(3, -2) : text;
  return andOperands(expression.replaceAll(/\s+/g, " ").trim()).some(
    (operand) => FORK_SAFE_OPERAND.test(operand),
  );
}

/** Each job of a `pull_request` workflow that reads a secret, as `file#job`. */
function secretJobs(file, workflow) {
  if (!runsOnPullRequest(workflow)) return [];
  return Object.entries(workflow.jobs ?? {})
    .filter(([, job]) => readsSecret(job))
    .map(([id, job]) => ({
      name: `${file}#${id}`,
      skipsForks: skipsForks(job.if),
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
  const withCondition = (condition) => ({ ...readsToken, if: condition });
  const LABELLED = "contains(github.event.pull_request.labels.*.name, 'x')";

  it("flags a pull_request job that reads a secret without the guard", () => {
    expect(check("pull_request", readsToken)).toEqual(["w.yml#build"]);
  });

  it.each([
    ["alone", FORK_GUARD],
    ["in an expression", `\${{ ${FORK_GUARD} }}`],
    ["in parentheses", `(${FORK_GUARD})`],
    ["after another operand", `${LABELLED} && ${FORK_GUARD}`],
    ["before another operand", `${FORK_GUARD} && ${LABELLED}`],
    ["across lines", `${LABELLED} &&\n  ${FORK_GUARD}`],
    ["after a string that contains &&", `a('x && y') && ${FORK_GUARD}`],
    [
      "behind a check that the event is not a pull request",
      `\${{ !cancelled() && (github.event_name != 'pull_request' || ${FORK_GUARD}) }}`,
    ],
  ])("accepts the guard %s", (_label, condition) => {
    expect(check("pull_request", withCondition(condition))).toEqual([]);
  });

  it.each([
    ["no condition", undefined],
    ["an unrelated condition", "github.event.action == 'closed'"],
    [
      "another repository",
      "github.event.pull_request.head.repo.full_name == 'a/b'",
    ],
    ["the guard as one side of ||", `${FORK_GUARD} || ${LABELLED}`],
    ["the guard negated", `!(${FORK_GUARD})`],
    ["the guard as a function argument", `a(${FORK_GUARD}, 'x')`],
    ["the guard inside a string", `a('${FORK_GUARD}')`],
    [
      "the guard in a group that is ORed with another",
      `(${LABELLED} && ${FORK_GUARD}) || github.event.action == 'closed'`,
    ],
  ])("rejects %s", (_label, condition) => {
    expect(check("pull_request", withCondition(condition))).toEqual([
      "w.yml#build",
    ]);
  });

  it("finds pull_request among several triggers", () => {
    expect(check(["push", "pull_request"], readsToken)).toEqual([
      "w.yml#build",
    ]);
    expect(
      check({ push: {}, pull_request: { types: ["opened"] } }, readsToken),
    ).toEqual(["w.yml#build"]);
  });

  it.each([
    ["secrets: inherit", { uses: "./w.yml", secrets: "inherit" }],
    [
      "a secret handed to a reusable workflow",
      { uses: "./w.yml", secrets: { token: "${{ secrets.TOKEN }}" } },
    ],
    ["the bracket syntax", { run: "echo ${{ secrets['TOKEN'] }}" }],
    ["a computed name", { run: "echo ${{ secrets[matrix.token_name] }}" }],
    ["the whole context", { run: "echo ${{ toJSON(secrets) }}" }],
  ])("flags %s", (_label, job) => {
    expect(check("pull_request", job)).toEqual(["w.yml#build"]);
  });

  it.each([
    ["dot syntax", "${{ secrets.GITHUB_TOKEN }}"],
    ["bracket syntax", "${{ secrets['github_token'] }}"],
  ])("ignores GITHUB_TOKEN, which forks do get (%s)", (_label, expression) => {
    expect(check("pull_request", { env: { GH_TOKEN: expression } })).toEqual(
      [],
    );
  });

  it.each([
    ["a literal in a script", { run: "see secrets.TOKEN in the docs" }],
    ["a member of another context", { run: "echo ${{ inputs.secrets }}" }],
    ["a step name", { steps: [{ name: "Use secrets", run: "true" }] }],
  ])("ignores text that does not read a secret: %s", (_label, job) => {
    expect(check("pull_request", job)).toEqual([]);
  });

  it("ignores workflows that a fork pull request does not trigger", () => {
    expect(check("push", readsToken)).toEqual([]);
    expect(check("pull_request_target", readsToken)).toEqual([]);
  });
});
