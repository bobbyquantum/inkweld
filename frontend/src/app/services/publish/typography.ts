/**
 * Publish-time typography: straight quotes and hyphen runs become the curly
 * quotes, apostrophes and dashes a typeset book uses.
 *
 * Stored documents are never touched. The editor keeps what was typed, and
 * generators run the content tree through {@link smartenDocument} on the way
 * out. Kept free of Angular so it can be tested directly.
 */
import { PublishFormat, type PublishPlan } from '@models/publish-plan';

/** Quote marks for one language. */
export interface QuoteStyle {
  open: string;
  close: string;
  openInner: string;
  closeInner: string;
  /** Text inserted inside the outer quotes (French wants a no-break space). */
  pad?: string;
}

const EN: QuoteStyle = {
  open: '“',
  close: '”',
  openInner: '‘',
  closeInner: '’',
};

const QUOTE_STYLES: Record<string, QuoteStyle> = {
  en: EN,
  nl: EN,
  pt: EN,
  ar: EN,
  he: EN,
  de: {
    open: '„',
    close: '“',
    openInner: '‚',
    closeInner: '‘',
  },
  cs: {
    open: '„',
    close: '“',
    openInner: '‚',
    closeInner: '‘',
  },
  sk: {
    open: '„',
    close: '“',
    openInner: '‚',
    closeInner: '‘',
  },
  sl: {
    open: '„',
    close: '“',
    openInner: '‚',
    closeInner: '‘',
  },
  pl: {
    open: '„',
    close: '”',
    openInner: '‚',
    closeInner: '’',
  },
  sv: {
    open: '”',
    close: '”',
    openInner: '’',
    closeInner: '’',
  },
  fi: {
    open: '”',
    close: '”',
    openInner: '’',
    closeInner: '’',
  },
  da: {
    open: '»',
    close: '«',
    openInner: '›',
    closeInner: '‹',
  },
  nb: {
    open: '«',
    close: '»',
    openInner: '‘',
    closeInner: '’',
  },
  fr: {
    open: '«',
    close: '»',
    openInner: '“',
    closeInner: '”',
    pad: ' ',
  },
  es: {
    open: '«',
    close: '»',
    openInner: '“',
    closeInner: '”',
  },
  it: {
    open: '«',
    close: '»',
    openInner: '“',
    closeInner: '”',
  },
  ru: {
    open: '«',
    close: '»',
    openInner: '„',
    closeInner: '“',
  },
  uk: {
    open: '«',
    close: '»',
    openInner: '„',
    closeInner: '“',
  },
  ja: {
    open: '「',
    close: '」',
    openInner: '『',
    closeInner: '』',
  },
  zh: {
    open: '“',
    close: '”',
    openInner: '‘',
    closeInner: '’',
  },
};
QUOTE_STYLES['no'] = QUOTE_STYLES['nb'];
QUOTE_STYLES['nn'] = QUOTE_STYLES['nb'];

/** Languages that set a parenthetical dash as a spaced en dash, not an em dash. */
const SPACED_EN_DASH = new Set([
  'de',
  'cs',
  'sk',
  'pl',
  'ru',
  'uk',
  'fr',
  'it',
  'nl',
]);

const EN_DASH = '–';
const EM_DASH = '—';
const APOSTROPHE = '’';
/** Stands in for non-text content (inline code, images…) in a text run. */
const OBJECT = '￼';

const primaryLanguage = (language: string | undefined): string =>
  (language ?? 'en').split(/[-_]/)[0].toLowerCase();

export function quoteStyleFor(language: string | undefined): QuoteStyle {
  return QUOTE_STYLES[primaryLanguage(language)] ?? EN;
}

/** Words that take a leading apostrophe, not an opening quote ('tis, 'em…). */
const ELISIONS = /^(?:tis|twas|twere|twill|em|cause|cos|til|round|n|im|ere)\b/i;

const OPENING_CONTEXT = new RegExp(
  String.raw`[\s([{${EM_DASH}${EN_DASH}\u00A0${OBJECT}]`
);
const WORD_CHAR = /[\p{L}\p{N}]/u;
const isOpeningContext = (prev: string | undefined, quotes: QuoteStyle) =>
  prev === undefined ||
  OPENING_CONTEXT.test(prev) ||
  prev === quotes.open ||
  prev === quotes.openInner;

/** Working state while converting one run of text. */
interface RunContext {
  quotes: QuoteStyle;
  dash: string;
  /** The input, one entry per character. */
  chars: string[];
  /** What each input character becomes ('' when merged into a neighbour). */
  out: string[];
}

/** The last character already written before position `i`. */
function prevWritten(ctx: RunContext, i: number): string | undefined {
  for (let j = i - 1; j >= 0; j--) {
    if (ctx.out[j]) return ctx.out[j].slice(-1);
  }
  return undefined;
}

const isSpace = (ch: string | undefined): boolean =>
  ch !== undefined && /\s/.test(ch);

/**
 * `--` and `---` become a dash; a lone hyphen between spaced words becomes
 * an en dash. Returns how many extra characters were consumed, or -1 when
 * position `i` is not a dash.
 */
function convertDash(ctx: RunContext, i: number): number {
  const { chars, out } = ctx;
  if (chars[i] !== '-') return -1;
  if (chars[i + 1] === '-') {
    const long = chars[i + 2] === '-';
    out[i] = long ? EM_DASH : ctx.dash;
    out[i + 1] = '';
    if (long) out[i + 2] = '';
    return long ? 2 : 1;
  }
  const spaced = isSpace(chars[i - 1]) && isSpace(chars[i + 1]);
  if (spaced && i > 1 && !isSpace(chars[i - 2])) {
    out[i] = EN_DASH;
    return 0;
  }
  return -1;
}

function convertDoubleQuote(ctx: RunContext, i: number): void {
  const { quotes, chars } = ctx;
  const next = chars[i + 1];
  const pad = quotes.pad ?? '';
  if (next !== undefined && isOpeningContext(prevWritten(ctx, i), quotes)) {
    ctx.out[i] = quotes.open + (isSpace(next) ? '' : pad);
    return;
  }
  const before = chars[i - 1];
  const needsPad = before !== undefined && !isSpace(before);
  ctx.out[i] = (needsPad ? pad : '') + quotes.close;
}

function convertSingleQuote(ctx: RunContext, text: string, i: number): void {
  const { quotes, chars } = ctx;
  const prev = prevWritten(ctx, i);
  const next = chars[i + 1];
  const rest = text.slice(i + 1);
  const wordBefore = prev !== undefined && WORD_CHAR.test(prev);
  const wordAfter = next !== undefined && WORD_CHAR.test(next);
  const opening = isOpeningContext(prev, quotes);

  if (wordBefore && wordAfter) {
    ctx.out[i] = APOSTROPHE;
  } else if (opening && wordAfter) {
    // 'tis, 'em, '90s: an apostrophe standing in for dropped letters.
    const elided = ELISIONS.test(rest) || /^\d\d(?!\d)/.test(rest);
    ctx.out[i] = elided ? APOSTROPHE : quotes.openInner;
  } else if (opening && next && /\S/.test(next)) {
    ctx.out[i] = quotes.openInner;
  } else {
    // After a word or closing punctuation: closing quote or apostrophe (dogs').
    ctx.out[i] = quotes.closeInner;
  }
}

/**
 * Convert a run of text. The run may be a whole paragraph assembled from
 * several marked pieces, so a quote at the start of a piece still sees what
 * precedes it. Returns, for every input character, what it becomes (an empty
 * string when it was merged into the previous replacement), which lets the
 * caller split the result back into its pieces.
 */
function convertRun(text: string, language: string | undefined): string[] {
  const chars = Array.from(text);
  const ctx: RunContext = {
    quotes: quoteStyleFor(language),
    dash: SPACED_EN_DASH.has(primaryLanguage(language)) ? EN_DASH : EM_DASH,
    chars,
    out: chars.slice(),
  };

  for (let i = 0; i < chars.length; i++) {
    const consumed = convertDash(ctx, i);
    if (consumed >= 0) {
      i += consumed;
    } else if (chars[i] === '"') {
      convertDoubleQuote(ctx, i);
    } else if (chars[i] === "'") {
      convertSingleQuote(ctx, text, i);
    }
  }
  return ctx.out;
}

/** Convert one stand-alone string. */
export function smartenText(text: string, language?: string): string {
  return convertRun(text, language).join('');
}

/**
 * Convert text pieces that form one run (the leaves of a paragraph).
 * `null` entries are boundaries that must not be converted (inline code,
 * images, …): they keep their place in the context but are returned as-is.
 */
export function smartenSegments(
  segments: (string | null)[],
  language?: string
): (string | null)[] {
  const joined = segments.map(s => s ?? OBJECT).join('');
  const converted = convertRun(joined, language);
  const result: (string | null)[] = [];
  let offset = 0;
  for (const segment of segments) {
    if (segment === null) {
      result.push(null);
      offset += 1;
      continue;
    }
    const length = Array.from(segment).length;
    result.push(converted.slice(offset, offset + length).join(''));
    offset += length;
  }
  return result;
}

// ── Document tree ────────────────────────────────────────────────────────

type Rec = Record<string, unknown>;

const isRec = (v: unknown): v is Rec =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Block nodes whose text is literal and must stay as typed. */
const LITERAL_NODES = new Set(['code_block', 'codeblock', 'pre', 'code']);

function nodeName(node: Rec): string {
  if (typeof node['nodeName'] === 'string')
    return node['nodeName'].toLowerCase();
  if (typeof node['type'] === 'string') return node['type'].toLowerCase();
  return '';
}

function hasCodeMark(node: Rec): boolean {
  const marks = node['marks'];
  if (!Array.isArray(marks)) return false;
  return (marks as unknown[]).some(m => {
    const type = isRec(m) ? m['type'] : m;
    return typeof type === 'string' && type.toLowerCase() === 'code';
  });
}

const isTextLeaf = (child: unknown): boolean =>
  typeof child === 'string' ||
  (isRec(child) && typeof child['text'] === 'string');

/**
 * Return a copy of a document tree with typographic quotes and dashes
 * applied. Accepts both ProseMirror JSON (`type`/`content`/`text`) and the
 * Yjs shape (`nodeName`/`children`, string leaves). Code blocks and
 * code-marked text are left alone; the input is not modified.
 */
export function smartenDocument<T>(doc: T, language?: string): T {
  return smartenNode(doc, language) as T;
}

function childKey(node: Rec): 'content' | 'children' | null {
  if (Array.isArray(node['content'])) return 'content';
  if (Array.isArray(node['children'])) return 'children';
  return null;
}

function smartenNode(node: unknown, language: string | undefined): unknown {
  if (Array.isArray(node)) return smartenChildren(node, language);
  if (!isRec(node)) return node;
  if (LITERAL_NODES.has(nodeName(node))) return node;

  const key = childKey(node);
  if (!key) return node;
  return {
    ...node,
    [key]: smartenChildren(node[key] as unknown[], language),
  };
}

function smartenChildren(
  children: unknown[],
  language: string | undefined
): unknown[] {
  if (!children.some(isTextLeaf)) {
    return children.map(c => smartenNode(c, language));
  }

  // A textblock: convert its text as one run so context carries across marks.
  const segments = children.map(c => {
    if (typeof c === 'string') return c;
    if (isRec(c) && typeof c['text'] === 'string' && !hasCodeMark(c)) {
      return c['text'];
    }
    return null;
  });
  const converted = smartenSegments(segments, language);
  return children.map((child, i) => {
    const text = converted[i];
    if (text === null) return smartenNode(child, language);
    return typeof child === 'string' ? text : { ...(child as Rec), text };
  });
}

// ── Plan option ──────────────────────────────────────────────────────────

/**
 * The language to typeset a plan's text in, or null when typographic
 * conversion is off. Plans that never set the option follow the format's
 * default: on for the typeset outputs (EPUB, PDF, HTML, website), off for
 * Markdown, whose output is source text a person may edit further.
 */
export function typographyLanguageFor(plan: PublishPlan): string | null {
  const enabled =
    plan.options.typographicQuotes ?? plan.format !== PublishFormat.MARKDOWN;
  return enabled ? plan.metadata.language || 'en' : null;
}
