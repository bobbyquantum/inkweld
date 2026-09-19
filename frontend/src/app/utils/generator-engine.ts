/**
 * Random generator expansion engine.
 *
 * Pure and synchronous: no Angular, no DI, no I/O. A roll expands the
 * generator's root template, replacing every `#rule#` reference with a
 * weighted random entry from that rule, recursively.
 *
 * The engine never throws and never loops forever. A user is free to write
 * `a: ["#b#"], b: ["#a#"]`, so expansion is bounded by depth, by a total
 * expansion budget and by output length; an expansion that hits a limit
 * leaves the offending reference as literal text rather than failing.
 * {@link validateGenerator} surfaces the same problems in the editor before
 * a roll is ever attempted.
 */

import {
  type Generator,
  type GeneratorEntry,
  type GeneratorRule,
  RULE_KEY_PATTERN,
} from '@models/generator';

/** Maximum nesting of `#rule#` expansions within a single roll. */
export const MAX_EXPANSION_DEPTH = 25;

/** Maximum number of references expanded across a single roll. */
export const MAX_EXPANSIONS = 1000;

/** Maximum length of a single roll's output, in characters. */
export const MAX_OUTPUT_LENGTH = 500;

/**
 * Maximum number of characters expansions may contribute to one roll.
 *
 * Clamping only the finished string is not enough: 1000 expansions of a
 * 10,000-character entry would build a 10 MB string before the clamp ever
 * ran. Generators sync between collaborators and arrive in imported
 * archives, and the settings list rolls a sample for every generator it
 * shows, so that work would happen unprompted on someone else's machine.
 * This budget keeps a roll's cost bounded no matter how the rules are
 * written; the headroom over {@link MAX_OUTPUT_LENGTH} leaves room for text
 * that modifiers later trim away.
 */
export const MAX_EXPANSION_CHARS = MAX_OUTPUT_LENGTH * 4;

/**
 * Matches a reference: `#key#`, optionally followed by dot-separated
 * modifiers such as `#key.capitalize.a#`.
 */
const REFERENCE_PATTERN = /#([a-zA-Z]\w*)((?:\.[a-zA-Z]+)*)#/g;

/**
 * Modifiers a reference may apply to its expanded text.
 *
 * A `Map`, not an object literal: modifier names come from user-written
 * rules, and a plain-object lookup would also resolve inherited members, so
 * `#word.toString#` would find `Object.prototype.toString` and render
 * "[object Undefined]" while validation stayed silent about it.
 */
const MODIFIERS = new Map<string, (value: string) => string>([
  ['capitalize', value => value.charAt(0).toUpperCase() + value.slice(1)],
  ['upper', value => value.toUpperCase()],
  ['lower', value => value.toLowerCase()],
  [
    'title',
    value => value.replace(/\b\p{L}/gu, character => character.toUpperCase()),
  ],
  ['a', value => (/^[aeiou]/i.test(value) ? `an ${value}` : `a ${value}`)],
  ['s', pluralize],
  ['trim', value => value.trim().replace(/\s+/g, ' ')],
]);

/** Names of the modifiers a reference may use, for editor hints. */
export const MODIFIER_NAMES = [...MODIFIERS.keys()];

/** Options for {@link rollGenerator}. */
export interface RollOptions {
  /**
   * Seed for the master PRNG. Omit for a random seed; each result carries
   * its own seed so a single roll can be reproduced exactly.
   */
  seed?: number;
  /** How many results to produce (default 1). */
  count?: number;
  /** Drop duplicate results within this batch. */
  unique?: boolean;
  /**
   * Results to reject — typically names already used in the project.
   * Matched case-insensitively after trimming.
   */
  exclude?: Iterable<string>;
}

/** A single generated result. */
export interface RollResult {
  /** The generated text. */
  text: string;
  /** Seed that reproduces exactly this result. */
  seed: number;
}

/** Why a generator is not (yet) valid. */
export type GeneratorIssueCode =
  | 'empty-template'
  | 'invalid-key'
  | 'duplicate-key'
  | 'empty-rule'
  | 'unknown-reference'
  | 'unknown-modifier'
  | 'non-terminating';

/**
 * How badly an issue breaks the generator. Errors make rolls meaningless and
 * block saving; warnings are ignored at roll time and are only advice.
 */
export type GeneratorIssueSeverity = 'error' | 'warning';

/** Issues that only affect presentation, not whether a roll works at all. */
const WARNING_CODES: ReadonlySet<GeneratorIssueCode> = new Set([
  'unknown-modifier',
]);

/** A single validation problem, addressed to one rule or to the template. */
export interface GeneratorIssue {
  code: GeneratorIssueCode;
  /** Derived from {@link GeneratorIssue.code}; see {@link GeneratorIssueSeverity}. */
  severity: GeneratorIssueSeverity;
  /** Human-readable, ready to show under the offending field. */
  message: string;
  /** Rule the issue belongs to; omitted for template-level issues. */
  ruleKey?: string;
  /** The reference or modifier name the issue is about, where relevant. */
  name?: string;
}

/**
 * Expands a generator's template `count` times.
 *
 * With `unique` or `exclude` set, rejected results are re-rolled a bounded
 * number of times; a generator with too few distinct outputs therefore
 * returns fewer results than requested rather than looping.
 */
export function rollGenerator(
  generator: Generator,
  options: RollOptions = {}
): RollResult[] {
  const count = Math.max(1, Math.trunc(options.count ?? 1));
  const rules = indexRules(rulesOf(generator));
  const masterSeed = options.seed ?? randomSeed();
  const master = mulberry32(masterSeed);

  const seen = new Set<string>();
  for (const value of options.exclude ?? []) {
    seen.add(normalizeForComparison(value));
  }

  const filtering = options.unique === true || seen.size > 0;
  const maxAttempts = filtering ? count * 10 + 20 : count;
  const results: RollResult[] = [];

  // The first attempt expands with the master seed itself, so that
  // `rollGenerator(g, { seed })[0].seed === seed` and re-rolling any single
  // reported seed reproduces exactly that result.
  let seed = masterSeed;

  for (
    let attempt = 0;
    attempt < maxAttempts && results.length < count;
    attempt++, seed = nextSeed(master)
  ) {
    const text = expandTemplate(templateOf(generator), rules, mulberry32(seed));
    if (filtering) {
      const key = normalizeForComparison(text);
      // An empty result can never be distinguished from another empty one,
      // so it is dropped rather than filling the batch with blanks.
      if (key.length === 0 || seen.has(key)) continue;
      seen.add(key);
    }
    results.push({ text, seed });
  }

  return results;
}

/**
 * Reports everything wrong with a generator: bad rule keys, references that
 * resolve to nothing, and rules whose every path recurses forever.
 */
export function validateGenerator(generator: Generator): GeneratorIssue[] {
  const rules = rulesOf(generator);
  const template = templateOf(generator);

  // Severity is derived from the code once, at the end, so each check below
  // only has to say what is wrong.
  const issues: RawIssue[] = [
    ...templateIssues(template),
    ...ruleIssues(rules),
    ...referenceIssues(template, rules),
    ...terminationIssues(rules),
  ];

  return issues.map(issue => ({
    ...issue,
    severity: WARNING_CODES.has(issue.code)
      ? ('warning' as const)
      : ('error' as const),
  }));
}

/** An issue before its severity is derived from the code. */
type RawIssue = Omit<GeneratorIssue, 'severity'>;

function templateIssues(template: string): RawIssue[] {
  if (template.trim().length > 0) return [];
  return [
    {
      code: 'empty-template',
      message: 'The template is empty, so every roll produces nothing.',
    },
  ];
}

/** Malformed keys, keys used twice, and rules with nothing to choose from. */
function ruleIssues(rules: GeneratorRule[]): RawIssue[] {
  const issues: RawIssue[] = [];
  const seenKeys = new Set<string>();

  for (const rule of rules) {
    if (!RULE_KEY_PATTERN.test(rule.key)) {
      issues.push({
        code: 'invalid-key',
        ruleKey: rule.key,
        message: `"${rule.key}" is not a valid rule name — start with a letter and use only letters, digits and underscores.`,
      });
    } else if (seenKeys.has(rule.key)) {
      issues.push({
        code: 'duplicate-key',
        ruleKey: rule.key,
        message: `More than one rule is named "${rule.key}".`,
      });
    }
    seenKeys.add(rule.key);

    if (usableEntries(rule).length === 0) {
      issues.push({
        code: 'empty-rule',
        ruleKey: rule.key,
        message: `Rule "${rule.key}" has no entries to choose from.`,
      });
    }
  }

  return issues;
}

/** References that resolve to no rule, and modifiers that do not exist. */
function referenceIssues(template: string, rules: GeneratorRule[]): RawIssue[] {
  const known = new Set(rules.map(rule => rule.key));
  const sources: { ruleKey?: string; text: string }[] = [
    { text: template },
    ...rules.flatMap(rule =>
      usableEntries(rule).map(entry => ({
        ruleKey: rule.key,
        text: entry.text,
      }))
    ),
  ];

  const issues: RawIssue[] = [];
  // Each bad name is reported once per rule, not once per occurrence.
  const reported = new Set<string>();

  for (const source of sources) {
    for (const reference of parseReferences(source.text)) {
      if (!known.has(reference.key)) {
        addOnce(
          issues,
          reported,
          `ref:${source.ruleKey ?? ''}:${reference.key}`,
          {
            code: 'unknown-reference',
            ruleKey: source.ruleKey,
            name: reference.key,
            message: `#${reference.key}# does not match any rule.`,
          }
        );
      }
      for (const modifier of reference.modifiers) {
        if (MODIFIERS.has(modifier)) continue;
        addOnce(issues, reported, `mod:${source.ruleKey ?? ''}:${modifier}`, {
          code: 'unknown-modifier',
          ruleKey: source.ruleKey,
          name: modifier,
          message: `"${modifier}" is not a known modifier. Available: ${MODIFIER_NAMES.join(', ')}.`,
        });
      }
    }
  }

  return issues;
}

function addOnce(
  issues: RawIssue[],
  reported: Set<string>,
  id: string,
  issue: RawIssue
): void {
  if (reported.has(id)) return;
  reported.add(id);
  issues.push(issue);
}

/** Rules whose every path recurses forever. */
function terminationIssues(rules: GeneratorRule[]): RawIssue[] {
  const known = new Set(rules.map(rule => rule.key));
  return findNonTerminatingRules(rules, known).map(key => ({
    code: 'non-terminating' as const,
    ruleKey: key,
    message: `Rule "${key}" always refers back to itself, so it can never finish expanding.`,
  }));
}

/** True when nothing would stop this generator from producing usable rolls. */
export function isGeneratorValid(generator: Generator): boolean {
  return validateGenerator(generator).every(
    issue => issue.severity !== 'error'
  );
}

/** A reference parsed out of template text. */
interface ParsedReference {
  key: string;
  modifiers: string[];
}

/** Every `#rule#` reference in `text`, in order of appearance. */
export function parseReferences(text: string): ParsedReference[] {
  const references: ParsedReference[] = [];
  for (const match of text.matchAll(REFERENCE_PATTERN)) {
    references.push({
      key: match[1],
      modifiers: splitModifiers(match[2]),
    });
  }
  return references;
}

// ─────────────────────────────────────────────────────────────────────────────
// Expansion
// ─────────────────────────────────────────────────────────────────────────────

/** Mutable per-roll budget, shared across the whole recursion. */
interface ExpansionBudget {
  /** Reference expansions still allowed. */
  remaining: number;
  /** Characters expansions may still contribute. */
  chars: number;
}

function expandTemplate(
  template: string,
  rules: Map<string, GeneratorRule>,
  random: () => number
): string {
  const budget: ExpansionBudget = {
    remaining: MAX_EXPANSIONS,
    chars: MAX_EXPANSION_CHARS,
  };
  const expanded = expand(template, rules, random, 0, budget);
  return expanded.length > MAX_OUTPUT_LENGTH
    ? expanded.slice(0, MAX_OUTPUT_LENGTH)
    : expanded;
}

function expand(
  text: string,
  rules: Map<string, GeneratorRule>,
  random: () => number,
  depth: number,
  budget: ExpansionBudget
): string {
  // `replace` with a function evaluates matches left to right, which keeps
  // the sequence of random draws stable for a given seed.
  return text.replace(
    REFERENCE_PATTERN,
    (match, key: string, rawModifiers: string) => {
      const rule = rules.get(key);
      // An unknown rule, either exhausted budget or run-away recursion all
      // leave the reference as literal text: visible to the user, harmless
      // to the app.
      if (
        !rule ||
        depth >= MAX_EXPANSION_DEPTH ||
        budget.remaining <= 0 ||
        budget.chars <= 0
      ) {
        return match;
      }
      budget.remaining--;
      const entry = pickEntry(rule, random);
      if (!entry) return match;
      const value = expand(entry.text, rules, random, depth + 1, budget);
      budget.chars -= value.length;
      return applyModifiers(value, splitModifiers(rawModifiers));
    }
  );
}

/** Weighted choice among a rule's entries; null when there is nothing to pick. */
function pickEntry(
  rule: GeneratorRule,
  random: () => number
): GeneratorEntry | null {
  const usable = usableEntries(rule);
  if (usable.length === 0) return null;

  const weights = usable.map(entry => effectiveWeight(entry.weight));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let target = random() * total;
  for (const [index, weight] of weights.entries()) {
    target -= weight;
    if (target < 0) return usable[index];
  }
  return usable.at(-1) ?? null;
}

/** Missing, non-finite and non-positive weights all behave as 1. */
function effectiveWeight(weight: number | undefined): number {
  return weight !== undefined && Number.isFinite(weight) && weight > 0
    ? weight
    : 1;
}

function applyModifiers(value: string, modifiers: string[]): string {
  let result = value;
  for (const modifier of modifiers) {
    const apply = MODIFIERS.get(modifier);
    if (apply) result = apply(result);
  }
  return result;
}

function splitModifiers(raw: string): string[] {
  return raw ? raw.split('.').filter(part => part.length > 0) : [];
}

function pluralize(value: string): string {
  if (value.length === 0) return value;
  if (/[^aeiou]y$/i.test(value)) return `${value.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(value)) return `${value}es`;
  return `${value}s`;
}

/** Last rule wins on duplicate keys, matching the editor's own list order. */
function indexRules(rules: GeneratorRule[]): Map<string, GeneratorRule> {
  return new Map(rules.map(rule => [rule.key, rule]));
}

// ─────────────────────────────────────────────────────────────────────────────
// Untrusted input
//
// Generators arrive from imported archives and from collaborators' writes to
// the shared document, neither of which is shape-checked on the way in. The
// accessors below keep a hand-crafted `generators.json` — a numeric `text`, a
// missing `entries` array — from turning into a TypeError that would take out
// every surface that rolls, rather than just producing a poor generator.
// ─────────────────────────────────────────────────────────────────────────────

/** The generator's rules, or none when the field is not a usable array. */
function rulesOf(generator: Generator): GeneratorRule[] {
  return Array.isArray(generator.rules)
    ? generator.rules.filter(
        rule =>
          rule !== null &&
          typeof rule === 'object' &&
          typeof rule.key === 'string'
      )
    : [];
}

/** The generator's root template, or the empty string when it is not text. */
function templateOf(generator: Generator): string {
  return typeof generator.template === 'string' ? generator.template : '';
}

/** A rule's entries that carry non-blank text; everything else is skipped. */
function usableEntries(rule: GeneratorRule): GeneratorEntry[] {
  if (!Array.isArray(rule.entries)) return [];
  return rule.entries.filter(
    entry =>
      entry !== null &&
      typeof entry === 'object' &&
      typeof entry.text === 'string' &&
      entry.text.trim().length > 0
  );
}

/**
 * Rules with no terminating path, found by fixpoint: a rule terminates when
 * at least one of its entries only references rules already known to
 * terminate. References to rules that do not exist count as terminating —
 * they expand to literal text and are reported separately.
 */
function findNonTerminatingRules(
  rules: GeneratorRule[],
  known: ReadonlySet<string>
): string[] {
  const terminating = new Set<string>();
  let changed = true;

  while (changed) {
    changed = false;
    for (const rule of rules) {
      if (terminating.has(rule.key)) continue;
      const terminates = usableEntries(rule).some(entry => {
        return parseReferences(entry.text).every(
          reference =>
            !known.has(reference.key) || terminating.has(reference.key)
        );
      });
      if (terminates) {
        terminating.add(rule.key);
        changed = true;
      }
    }
  }

  // Rules with no usable entries are reported as `empty-rule` instead, so
  // they are not also flagged here.
  return rules
    .filter(
      rule => !terminating.has(rule.key) && usableEntries(rule).length > 0
    )
    .map(rule => rule.key);
}

// ─────────────────────────────────────────────────────────────────────────────
// Randomness
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mulberry32: a small, fast, seedable PRNG. Seeding matters here so that
 * tests, the editor preview and "roll this again" all reproduce exactly.
 *
 * Not cryptographically secure, and deliberately reproducible from its seed
 * — never use it for tokens, ids or anything else that must be unguessable.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A fresh 32-bit seed for an unseeded roll.
 *
 * Drawn from the platform CSPRNG rather than `Math.random()`. Seeds are the
 * one place in this engine where unpredictability is worth anything — two
 * collaborators rolling at the same moment should not land on correlated
 * sequences — and it costs nothing here, since a roll draws one seed and
 * then runs on {@link mulberry32}, which has to stay reproducible.
 */
function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

/** Derives the next per-result seed from the master PRNG. */
function nextSeed(random: () => number): number {
  return Math.trunc(random() * 0xffffffff) >>> 0;
}

function normalizeForComparison(value: string): string {
  return value.trim().toLowerCase();
}
