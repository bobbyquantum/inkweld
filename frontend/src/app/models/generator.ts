/**
 * Random Generator Models
 *
 * A generator produces inspiration text — character names, place names,
 * writing prompts — by expanding a root template against a set of named
 * rules. The syntax is deliberately small:
 *
 * ```
 * template: "#first# #last#"
 * rules:
 *   first: [ "Aldric", "Brynn" (weight 3), "Cera" ]
 *   last:  [ "of #place#", "Stonehelm" ]
 *   place: [ "Riverwyn", "Ashford" ]
 * ```
 *
 * A plain word list is just a generator whose template is a single rule
 * reference, so the simple case needs no separate data model.
 *
 * Generators are project-scoped and stored in the project elements Yjs
 * document alongside schemas, tags and time systems.
 */

/** One possible expansion of a rule. */
export interface GeneratorEntry {
  /** Literal text, which may contain `#rule#` references. */
  text: string;
  /**
   * Relative likelihood of this entry being chosen, defaulting to 1.
   * Non-positive and non-finite weights are treated as 1 when rolling.
   */
  weight?: number;
}

/** A named set of alternatives, referenced from templates as `#key#`. */
export interface GeneratorRule {
  /** Reference name — must match {@link RULE_KEY_PATTERN}. */
  key: string;
  entries: GeneratorEntry[];
}

/** A project-scoped random generator. */
export interface Generator {
  /** Unique identifier (nanoid) */
  id: string;
  /** Display name shown in the library and on roll menus */
  name: string;
  /** Material icon name */
  icon: string;
  /** What this generator is for */
  description: string;
  /**
   * Free-text grouping used to sort and filter the library. The built-in
   * suggestions are in {@link GENERATOR_CATEGORIES}, but any string is valid.
   */
  category: string;
  /** Root template expanded once per roll, e.g. `"#first# #last#"` */
  template: string;
  /** Rules the template (and other rules) can reference */
  rules: GeneratorRule[];
  /** Creation timestamp (ISO string) */
  createdAt?: string;
  /** Last update timestamp (ISO string) */
  updatedAt?: string;
}

/** Suggested categories offered in the editor; users may type their own. */
export const GENERATOR_CATEGORIES = [
  'names',
  'places',
  'prompts',
  'things',
  'other',
] as const;

/** Default icon for a generator that does not pick one. */
export const DEFAULT_GENERATOR_ICON = 'casino';

/**
 * Valid rule keys: a letter followed by letters, digits or underscores. The
 * restriction keeps `#ref.modifier#` parsing unambiguous — a key can never
 * contain `.` or `#`.
 */
export const RULE_KEY_PATTERN = /^[a-zA-Z]\w*$/;

/** Creates an empty generator ready for the editor (caller supplies the id). */
export function createEmptyGenerator(id: string): Generator {
  const now = new Date().toISOString();
  return {
    id,
    name: '',
    icon: DEFAULT_GENERATOR_ICON,
    description: '',
    category: 'names',
    template: '',
    rules: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Deep-clones a generator so stored copies never alias editor state. */
export function cloneGenerator(generator: Generator): Generator {
  return {
    ...generator,
    rules: generator.rules.map(rule => ({
      key: rule.key,
      entries: rule.entries.map(entry => ({ ...entry })),
    })),
  };
}

/**
 * Parses the editor's one-entry-per-line text into entries.
 *
 * A trailing `| <number>` sets the entry's weight, so
 * `Aldric | 3` is three times as likely as `Brynn`. Blank lines are dropped.
 */
export function parseEntryLines(text: string): GeneratorEntry[] {
  const entries: GeneratorEntry[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    const entry = parseEntryLine(trimmed);
    entries.push(entry);
  }
  return entries;
}

/** Matches a weight on its own: anchored digits, so no backtracking. */
const WEIGHT_PATTERN = /^\d+(\.\d+)?$/;

/**
 * Splits one trimmed line into its text and optional trailing weight.
 *
 * The split is found with `lastIndexOf` rather than a regex. Matching
 * `^(.*?)\s*\|\s*(\d+)$` against a line with no separator retries every
 * split point, which is quadratic — a 64,000-character entry took 2.5s —
 * and this runs on every keystroke in the editor and on every generator
 * loaded from the project document or an imported archive.
 */
function parseEntryLine(trimmed: string): GeneratorEntry {
  const separator = trimmed.lastIndexOf('|');
  if (separator <= 0) return { text: trimmed };

  const text = trimmed.slice(0, separator).trim();
  const weightText = trimmed.slice(separator + 1).trim();
  if (text.length === 0 || !WEIGHT_PATTERN.test(weightText)) {
    return { text: trimmed };
  }

  const weight = Number.parseFloat(weightText);
  return weight === 1 ? { text } : { text, weight };
}

/** Renders entries back into the editor's one-entry-per-line text. */
export function formatEntryLines(entries: GeneratorEntry[]): string {
  return entries
    .map(entry =>
      entry.weight !== undefined && entry.weight !== 1
        ? `${entry.text} | ${entry.weight}`
        : entry.text
    )
    .join('\n');
}
